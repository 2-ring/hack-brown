import type { ActiveJob, AuthState, SessionRecord, SessionHistory } from './types';
import {
  setAuthToken,
  createTextSession,
  uploadImage,
  uploadFile,
  getSession,
  getSessionEvents,
  getUserPreferences,
} from './api';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
const MAX_HISTORY_SESSIONS = 10;
const MAX_PAGE_TEXT_LENGTH = 50000;
const CONTEXT_MENU_ID = 'send-to-dropcal';
const DROPCAL_URL = 'https://dropcal.ai';

// ===== Auth State Management =====

async function getAuth(): Promise<AuthState | null> {
  const result = await chrome.storage.local.get('auth');
  return result.auth || null;
}

async function setAuth(auth: AuthState): Promise<void> {
  await chrome.storage.local.set({ auth });
  setAuthToken(auth.accessToken);
  fetchAndStoreTheme();
}

async function fetchAndStoreTheme(): Promise<void> {
  try {
    const prefs = await getUserPreferences();
    const themeMode = prefs.theme_mode || 'auto';
    await chrome.storage.local.set({ themeMode });
  } catch {
    // If preferences fetch fails (e.g. token expired), default to auto
  }
}

async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove(['auth', 'themeMode']);
  setAuthToken(null);
}

async function ensureAuth(): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return false;

  // Proactively clear expired tokens (with 60s buffer)
  if (auth.expiresAt && Date.now() / 1000 > auth.expiresAt - 60) {
    await clearAuth();
    return false;
  }

  setAuthToken(auth.accessToken);
  return true;
}

// ===== Session History Management =====

async function getHistory(): Promise<SessionHistory> {
  const result = await chrome.storage.local.get('sessionHistory');
  return result.sessionHistory || { sessions: [] };
}

async function saveHistory(history: SessionHistory): Promise<void> {
  history.sessions = history.sessions.slice(0, MAX_HISTORY_SESSIONS);
  await chrome.storage.local.set({ sessionHistory: history });
}

async function addSessionRecord(record: SessionRecord): Promise<void> {
  const history = await getHistory();
  history.sessions = history.sessions.filter((s) => s.sessionId !== record.sessionId);
  history.sessions.unshift(record);
  await saveHistory(history);
}

async function updateSessionRecord(
  sessionId: string,
  updates: Partial<SessionRecord>,
): Promise<void> {
  const history = await getHistory();
  const idx = history.sessions.findIndex((s) => s.sessionId === sessionId);
  if (idx !== -1) {
    history.sessions[idx] = { ...history.sessions[idx], ...updates };
    await saveHistory(history);
  }
}

// ===== Context Menu Setup =====

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Send to DropCal',
    contexts: ['selection', 'image'],
  });

  // Migrate Phase 1 activeJob → sessionHistory if present
  migratePhase1Job();
});

async function migratePhase1Job(): Promise<void> {
  const result = await chrome.storage.session.get('activeJob');
  const job = result.activeJob as ActiveJob | undefined;
  if (job && job.sessionId && job.status === 'processed') {
    const record: SessionRecord = {
      sessionId: job.sessionId,
      status: 'processed',
      title: job.sessionTitle || null,
      eventCount: job.eventCount,
      eventSummaries: (job.events || []).slice(0, 3).map((e) => e.summary),
      events: job.events || [],
      createdAt: job.createdAt,
      inputType: 'text',
    };
    await addSessionRecord(record);
    await chrome.storage.session.remove('activeJob');
    clearBadge();
  }
}

// ===== Context Menu Click Handler =====

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  const hasAuth = await ensureAuth();
  if (!hasAuth) {
    setBadgeError();
    return;
  }

  try {
    let session;
    let inputType: SessionRecord['inputType'] = 'text';

    if (info.selectionText) {
      setBadgeProcessing();
      session = await createTextSession(info.selectionText);
      inputType = 'text';
    } else if (info.srcUrl) {
      setBadgeProcessing();
      session = await uploadImage(info.srcUrl);
      inputType = 'image';
    } else {
      return;
    }

    const record: SessionRecord = {
      sessionId: session.id,
      status: 'polling',
      title: null,
      eventCount: 0,
      eventSummaries: [],
      events: [],
      createdAt: Date.now(),
      inputType,
    };
    await addSessionRecord(record);

    pollSession(session.id);
  } catch (error) {
    console.error('DropCal: Failed to create session', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const msgLower = msg.toLowerCase();
    const isAuthError =
      msgLower.includes('401') || msgLower.includes('403') ||
      msgLower.includes('authentication') || msgLower.includes('jwt') ||
      msgLower.includes('token') || msgLower.includes('expired');

    setBadgeError();

    if (isAuthError) {
      await clearAuth();
    }
  }
});

// ===== Polling Logic =====

async function pollSession(sessionId: string): Promise<void> {
  const startTime = Date.now();

  const poll = async () => {
    if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
      await updateSessionRecord(sessionId, {
        status: 'error',
        errorMessage: 'Processing timed out. Please try again.',
      });
      setBadgeError();
      return;
    }

    try {
      const session = await getSession(sessionId);

      if (session.status === 'processed') {
        const { events, count } = await getSessionEvents(sessionId);

        await updateSessionRecord(sessionId, {
          status: 'processed',
          title: session.title || null,
          eventCount: count,
          eventSummaries: events.slice(0, 3).map((e) => e.summary),
          events,
        });

        setBadgeCount(count);

        chrome.notifications.create(`dropcal-${sessionId}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'DropCal',
          message: count === 1 ? '1 event scheduled' : `${count} events scheduled`,
        });

        chrome.action.openPopup().catch(() => {});
        return;
      }

      if (session.status === 'error') {
        await updateSessionRecord(sessionId, {
          status: 'error',
          errorMessage: session.error_message || 'Processing failed',
        });
        setBadgeError();
        return;
      }

      // Update title mid-processing if available
      if (session.title) {
        await updateSessionRecord(sessionId, { title: session.title });
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    } catch (error) {
      console.error('DropCal: Poll error', error);
      setTimeout(poll, POLL_INTERVAL_MS);
    }
  };

  poll();
}

// ===== Page Capture =====

async function capturePageText(): Promise<string | null> {
  const hasAuth = await ensureAuth();
  if (!hasAuth) return 'Not authenticated. Please sign in on dropcal.ai.';

  try {
    // Use lastFocusedWindow — service workers don't have a "current window"
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url) {
      return 'No active tab found.';
    }

    // Check for restricted URLs where executeScript can't run
    const url = tab.url;
    if (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://') ||
      url.startsWith('brave://') ||
      url.includes('chrome.google.com/webstore')
    ) {
      return 'Cannot capture this page. Try on a regular website.';
    }

    setBadgeProcessing();

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        text: document.body.innerText,
        title: document.title,
        url: document.URL,
      }),
    });

    const pageData = results?.[0]?.result;
    if (!pageData || !pageData.text) {
      return 'Could not read page content.';
    }

    let text = `Page: ${pageData.title}\nURL: ${pageData.url}\n\n${pageData.text}`;
    if (text.length > MAX_PAGE_TEXT_LENGTH) {
      const fullLength = text.length;
      text =
        text.slice(0, MAX_PAGE_TEXT_LENGTH) +
        `\n\n[Truncated — full page was ${fullLength} characters]`;
    }

    const session = await createTextSession(text);

    const record: SessionRecord = {
      sessionId: session.id,
      status: 'polling',
      title: pageData.title || null,
      eventCount: 0,
      eventSummaries: [],
      events: [],
      createdAt: Date.now(),
      inputType: 'page',
      pageUrl: pageData.url,
    };
    await addSessionRecord(record);

    pollSession(session.id);
    return null; // success
  } catch (error) {
    console.error('DropCal: Page capture failed', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return `Page capture failed: ${msg}`;
  }
}

// ===== Badge Helpers =====

function setBadgeProcessing(): void {
  chrome.action.setBadgeText({ text: '...' });
  chrome.action.setBadgeBackgroundColor({ color: '#1170C5' });
}

function setBadgeCount(count: number): void {
  chrome.action.setBadgeText({ text: String(count) });
  chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
}

function setBadgeError(): void {
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#c41e3a' });
}

function clearBadge(): void {
  chrome.action.setBadgeText({ text: '' });
}

// ===== Message Handler =====

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Content script sends auth token from dropcal.ai
  if (message.type === 'AUTH_TOKEN') {
    const { accessToken, refreshToken, expiresAt } = message;
    setAuth({ accessToken, refreshToken, expiresAt }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Content script sends theme mode changes from dropcal.ai
  if (message.type === 'THEME_CHANGED') {
    const themeMode = message.themeMode || 'auto';
    chrome.storage.local.set({ themeMode });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'AUTH_SIGNED_OUT') {
    clearAuth().then(() => sendResponse({ ok: true }));
    return true;
  }

  // Popup queries
  if (message.type === 'GET_STATUS') {
    Promise.all([
      chrome.storage.session.get('activeJob'),
      getAuth(),
    ]).then(([jobResult, auth]) => {
      sendResponse({ job: jobResult.activeJob || null, isAuthenticated: !!auth });
    });
    return true;
  }

  if (message.type === 'GET_AUTH') {
    getAuth().then((auth) => {
      sendResponse({ isAuthenticated: !!auth });
    });
    return true;
  }

  if (message.type === 'SIGN_IN') {
    chrome.tabs.create({ url: DROPCAL_URL });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'OPEN_SESSION') {
    const { sessionId } = message;
    const url = `${DROPCAL_URL}/s/${sessionId}`;
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'CLEAR_JOB') {
    chrome.storage.session.remove('activeJob');
    clearBadge();
    sendResponse({ ok: true });
    return false;
  }

  // Phase 2 — popup inputs
  if (message.type === 'CAPTURE_PAGE') {
    capturePageText().then((errorMsg) => {
      if (errorMsg) {
        setBadgeError();
        sendResponse({ ok: false, error: errorMsg });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (message.type === 'SUBMIT_TEXT') {
    const { text } = message;
    ensureAuth().then(async (hasAuth) => {
      if (!hasAuth) {
        sendResponse({ ok: false, error: 'Not authenticated' });
        return;
      }
      try {
        setBadgeProcessing();
        const session = await createTextSession(text);
        const record: SessionRecord = {
          sessionId: session.id,
          status: 'polling',
          title: null,
          eventCount: 0,
          eventSummaries: [],
          events: [],
          createdAt: Date.now(),
          inputType: 'text',
        };
        await addSessionRecord(record);
        pollSession(session.id);
        sendResponse({ ok: true });
      } catch (error) {
        console.error('DropCal: Submit text failed', error);
        setBadgeError();
        sendResponse({ ok: false });
      }
    });
    return true;
  }

  if (message.type === 'SUBMIT_FILE') {
    const { data, name, mimeType } = message;
    ensureAuth().then(async (hasAuth) => {
      if (!hasAuth) {
        sendResponse({ ok: false, error: 'Not authenticated' });
        return;
      }
      try {
        setBadgeProcessing();
        const fileData = new Uint8Array(data);
        const session = await uploadFile(fileData, name, mimeType);
        const record: SessionRecord = {
          sessionId: session.id,
          status: 'polling',
          title: null,
          eventCount: 0,
          eventSummaries: [],
          events: [],
          createdAt: Date.now(),
          inputType: mimeType.startsWith('image/') ? 'image' : 'file',
        };
        await addSessionRecord(record);
        pollSession(session.id);
        sendResponse({ ok: true });
      } catch (error) {
        console.error('DropCal: File upload failed', error);
        setBadgeError();
        sendResponse({ ok: false });
      }
    });
    return true;
  }

  if (message.type === 'GET_HISTORY') {
    getHistory().then((history) => {
      sendResponse({ sessions: history.sessions });
    });
    return true;
  }

  // Phase 2 — sidebar (fallback — popup handles this directly now)
  if (message.type === 'OPEN_SIDEBAR') {
    const { sessionId } = message;
    chrome.storage.session.set({ sidebarSessionId: sessionId });
    chrome.windows.getLastFocused().then((window) => {
      if (window.id) {
        (chrome.sidePanel as any).open({ windowId: window.id }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// ===== Notification Click =====

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith('dropcal-')) return;
  const sessionId = notificationId.replace('dropcal-', '');
  await chrome.storage.session.set({ sidebarSessionId: sessionId });
  // Notification click is a user gesture — open session in DropCal instead
  // (sidePanel.open from service worker without user gesture context is unreliable)
  const url = `${DROPCAL_URL}/s/${sessionId}`;
  chrome.tabs.create({ url });
});
