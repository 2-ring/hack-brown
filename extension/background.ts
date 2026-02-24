import type { ActiveJob, AuthState, SessionRecord, SessionHistory } from './types';
import {
  setAuthToken,
  createTextSession,
  uploadImage,
  getSession,
  getSessionEvents,
  getUserPreferences,
  getUserProfile,
  updateUserPreferences,
  getCalendarProviders,
  setPrimaryCalendarProvider,
  disconnectCalendarProvider,
  pushEvents,
} from './api';
import {
  api,
  storage,
  clearSessionFallback,
  notifications,
  action,
  panel,
  onPollTick,
  startPolling,
  stopPolling,
} from './compat';

const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
const MAX_HISTORY_SESSIONS = 10;
const CONTEXT_MENU_ID = 'send-to-dropcal';
const DROPCAL_URL = 'https://dropcal.ai';
const FEEDBACK_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Clear emulated session storage on startup (no-ops if real session storage exists)
clearSessionFallback();

// ===== Auth State Management =====

async function getAuth(): Promise<AuthState | null> {
  return new Promise((resolve) => {
    storage.local.get('auth', (result) => {
      resolve(result.auth || null);
    });
  });
}

async function setAuth(auth: AuthState): Promise<void> {
  await new Promise<void>((resolve) => {
    storage.local.set({ auth }, resolve);
  });
  setAuthToken(auth.accessToken);
  fetchAndStoreTheme();
}

async function fetchAndStoreTheme(): Promise<void> {
  try {
    const prefs = await getUserPreferences();
    const themeMode = prefs.theme_mode || 'auto';
    storage.local.set({ themeMode });
  } catch {
    // If preferences fetch fails (e.g. token expired), default to auto
  }
}

async function clearAuth(): Promise<void> {
  await new Promise<void>((resolve) => {
    storage.local.remove(['auth', 'themeMode'], resolve);
  });
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
  return new Promise((resolve) => {
    storage.local.get('sessionHistory', (result) => {
      resolve(result.sessionHistory || { sessions: [] });
    });
  });
}

async function saveHistory(history: SessionHistory): Promise<void> {
  history.sessions = history.sessions.slice(0, MAX_HISTORY_SESSIONS);
  await new Promise<void>((resolve) => {
    storage.local.set({ sessionHistory: history }, resolve);
  });
  syncBadge();
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

// ===== Notification Queue =====
// Tracks session IDs that need the user's attention (completion order).

async function getNotificationQueue(): Promise<string[]> {
  return new Promise((resolve) => {
    storage.local.get('notificationQueue', (result) => {
      resolve(result.notificationQueue || []);
    });
  });
}

async function saveNotificationQueue(queue: string[]): Promise<void> {
  await new Promise<void>((resolve) => {
    storage.local.set({ notificationQueue: queue }, resolve);
  });
  syncBadge();
}

async function pushNotification(sessionId: string): Promise<void> {
  const queue = await getNotificationQueue();
  if (!queue.includes(sessionId)) {
    queue.push(sessionId);
    await saveNotificationQueue(queue);
  }
}

async function removeNotification(sessionId: string): Promise<void> {
  const queue = await getNotificationQueue();
  await saveNotificationQueue(queue.filter((id) => id !== sessionId));
}

// ===== Context Menu Setup =====

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Send to DropCal',
    contexts: ['selection', 'image'],
  });

  // Migrate Phase 1 activeJob → sessionHistory if present
  migratePhase1Job();
});

async function migratePhase1Job(): Promise<void> {
  return new Promise((resolve) => {
    storage.session.get('activeJob', (result) => {
      const job = result.activeJob as ActiveJob | undefined;
      if (job && job.sessionId && job.status === 'processed') {
        const record: SessionRecord = {
          sessionId: job.sessionId,
          status: 'processed',
          title: job.sessionTitle || null,
          eventCount: job.eventCount,
          addedToCalendar: false,
          eventSummaries: (job.events || []).slice(0, 3).map((e) => e.summary),
          events: job.events || [],
          createdAt: job.createdAt,
          inputType: 'text',
        };
        addSessionRecord(record).then(() => {
          storage.session.remove('activeJob', () => resolve());
        });
      } else {
        resolve();
      }
    });
  });
}

// ===== Context Menu Click Handler =====

api.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  const hasAuth = await ensureAuth();
  if (!hasAuth) return;

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
      addedToCalendar: false,
      eventSummaries: [],
      events: [],
      createdAt: Date.now(),
      inputType,
    };
    await addSessionRecord(record);

    startPolling(session.id);
  } catch (error) {
    console.error('DropCal: Failed to create session', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const msgLower = msg.toLowerCase();
    const isAuthError =
      msgLower.includes('401') || msgLower.includes('403') ||
      msgLower.includes('authentication') || msgLower.includes('jwt') ||
      msgLower.includes('token') || msgLower.includes('expired');

    setBadgeError();
    setTimeout(() => syncBadge(), 5000);

    if (isAuthError) {
      await clearAuth();
    }
  }
});

// ===== Polling Logic =====

// Track poll start times for timeout detection
const pollStartTimes = new Map<string, number>();

onPollTick(async (sessionId) => {
  if (!pollStartTimes.has(sessionId)) {
    pollStartTimes.set(sessionId, Date.now());
  }

  const startTime = pollStartTimes.get(sessionId)!;

  if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
    stopPolling(sessionId);
    pollStartTimes.delete(sessionId);
    await updateSessionRecord(sessionId, {
      status: 'error',
      errorMessage: 'Processing timed out. Please try again.',
    });
    await pushNotification(sessionId);
    return;
  }

  try {
    const session = await getSession(sessionId);

    if (session.status === 'processed') {
      stopPolling(sessionId);
      pollStartTimes.delete(sessionId);

      const { events, count } = await getSessionEvents(sessionId);

      await updateSessionRecord(sessionId, {
        status: 'processed',
        title: session.title || null,
        icon: session.icon || null,
        eventCount: count,
        addedToCalendar: session.added_to_calendar,
        eventSummaries: events.slice(0, 3).map((e) => e.summary),
        events,
      });
      await pushNotification(sessionId);

      notifications.create(`dropcal-${sessionId}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'DropCal',
        message: count === 1 ? '1 event scheduled' : `${count} events scheduled`,
      });

      action.tryOpenPopup();
      return;
    }

    if (session.status === 'error') {
      stopPolling(sessionId);
      pollStartTimes.delete(sessionId);
      await updateSessionRecord(sessionId, {
        status: 'error',
        errorMessage: session.error_message || 'Processing failed',
      });
      await pushNotification(sessionId);
      return;
    }

    // Update title and icon mid-processing if available
    const midUpdates: Partial<SessionRecord> = {};
    if (session.title) midUpdates.title = session.title;
    if (session.icon) midUpdates.icon = session.icon;
    if (Object.keys(midUpdates).length > 0) {
      await updateSessionRecord(sessionId, midUpdates);
    }
  } catch (error) {
    console.error('DropCal: Poll error', error);
    // Don't stop — let the next tick retry
  }
});

// ===== Badge Helpers =====

let badgeSpinnerInterval: ReturnType<typeof setInterval> | null = null;

function setBadgeProcessing(): void {
  if (badgeSpinnerInterval !== null) return; // already spinning
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  action.setBadgeBackgroundColor({ color: '#1170C5' });
  action.setBadgeText({ text: frames[0] });
  badgeSpinnerInterval = setInterval(() => {
    i = (i + 1) % frames.length;
    action.setBadgeText({ text: frames[i] });
  }, 350);
}

function clearBadgeSpinner(): void {
  if (badgeSpinnerInterval !== null) {
    clearInterval(badgeSpinnerInterval);
    badgeSpinnerInterval = null;
  }
}

function setBadgeCount(count: number): void {
  clearBadgeSpinner();
  action.setBadgeText({ text: String(count) });
  action.setBadgeBackgroundColor({ color: '#2e7d32' });
}

function setBadgeError(): void {
  clearBadgeSpinner();
  action.setBadgeText({ text: '!' });
  action.setBadgeBackgroundColor({ color: '#c41e3a' });
}

function clearBadge(): void {
  clearBadgeSpinner();
  action.setBadgeText({ text: '' });
}

// Derives badge state from notification queue + session history.
async function syncBadge(): Promise<void> {
  const [history, queue] = await Promise.all([getHistory(), getNotificationQueue()]);
  const sessions = history.sessions;

  // Any session still polling → spinner
  if (sessions.some((s) => s.status === 'polling')) {
    setBadgeProcessing();
    return;
  }

  // Check pending notifications for errors and event counts
  let totalEvents = 0;
  let hasError = false;
  for (const id of queue) {
    const s = sessions.find((r) => r.sessionId === id);
    if (!s || s.dismissedAt || Date.now() - s.createdAt > FEEDBACK_EXPIRY_MS) continue;

    if (s.status === 'error' || (s.status === 'processed' && s.eventCount === 0)) {
      hasError = true;
    } else if (s.status === 'processed') {
      totalEvents += s.eventCount;
    }
  }

  if (hasError) {
    setBadgeError();
    return;
  }

  if (totalEvents > 0) {
    setBadgeCount(totalEvents);
    return;
  }

  // Default: clear
  clearBadge();
}

// ===== Message Handler =====

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
    storage.local.set({ themeMode });
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
      new Promise<Record<string, any>>((resolve) => {
        storage.session.get('activeJob', resolve);
      }),
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
    const heading = encodeURIComponent('Sign in to start creating events.');
    api.tabs.create({ url: `${DROPCAL_URL}/?auth=${heading}` });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'OPEN_SESSION') {
    const { sessionId } = message;
    const url = `${DROPCAL_URL}/s/${sessionId}`;
    api.tabs.create({ url });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'CLEAR_JOB') {
    storage.session.remove('activeJob');
    clearBadge();
    sendResponse({ ok: true });
    return false;
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
          addedToCalendar: false,
          eventSummaries: [],
          events: [],
          createdAt: Date.now(),
          inputType: 'text',
        };
        await addSessionRecord(record);
        startPolling(session.id);
        sendResponse({ ok: true });
      } catch (error) {
        console.error('DropCal: Submit text failed', error);
        clearBadge();
        sendResponse({ ok: false });
      }
    });
    return true;
  }

  // Popup uploads files directly via fetch, then sends this to start polling
  if (message.type === 'TRACK_SESSION') {
    const { sessionId, inputType } = message;
    setBadgeProcessing();
    const record: SessionRecord = {
      sessionId,
      status: 'polling',
      title: null,
      eventCount: 0,
      addedToCalendar: false,
      eventSummaries: [],
      events: [],
      createdAt: Date.now(),
      inputType: inputType || 'file',
    };
    addSessionRecord(record).then(() => {
      startPolling(sessionId);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'GET_HISTORY') {
    getHistory().then((history) => {
      sendResponse({ sessions: history.sessions });
    });
    return true;
  }

  // Sidebar
  if (message.type === 'OPEN_SIDEBAR') {
    const { sessionId } = message;
    api.windows.getLastFocused().then((window) => {
      if (window.id) {
        panel.open({ windowId: window.id, sessionId }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return false;
  }

  // Settings — get full user profile
  if (message.type === 'GET_USER_PROFILE') {
    ensureAuth().then(async (hasAuth) => {
      if (!hasAuth) {
        sendResponse({ ok: false, error: 'Not authenticated' });
        return;
      }
      try {
        const profile = await getUserProfile();
        sendResponse({ ok: true, profile });
      } catch (error) {
        console.error('DropCal: Failed to get profile', error);
        sendResponse({ ok: false, error: 'Failed to load profile' });
      }
    });
    return true;
  }

  // Settings — update preferences (theme_mode, date_format)
  if (message.type === 'UPDATE_PREFERENCES') {
    ensureAuth().then(async (hasAuth) => {
      if (!hasAuth) {
        sendResponse({ ok: false, error: 'Not authenticated' });
        return;
      }
      try {
        const result = await updateUserPreferences(message.preferences);
        // If theme_mode was updated, also update local storage for immediate theme change
        if (message.preferences.theme_mode) {
          storage.local.set({ themeMode: message.preferences.theme_mode });
        }
        sendResponse({ ok: true, preferences: result.preferences });
      } catch (error) {
        console.error('DropCal: Failed to update preferences', error);
        sendResponse({ ok: false, error: 'Failed to save preferences' });
      }
    });
    return true;
  }

  // Settings — get calendar providers
  if (message.type === 'GET_CALENDAR_PROVIDERS') {
    ensureAuth().then(async (hasAuth) => {
      if (!hasAuth) {
        sendResponse({ ok: false, error: 'Not authenticated' });
        return;
      }
      try {
        const result = await getCalendarProviders();
        sendResponse({ ok: true, providers: result.providers });
      } catch (error) {
        console.error('DropCal: Failed to get providers', error);
        sendResponse({ ok: false, error: 'Failed to load providers' });
      }
    });
    return true;
  }

  // Settings — set primary calendar provider
  if (message.type === 'SET_PRIMARY_PROVIDER') {
    ensureAuth().then(async (hasAuth) => {
      if (!hasAuth) {
        sendResponse({ ok: false, error: 'Not authenticated' });
        return;
      }
      try {
        await setPrimaryCalendarProvider(message.provider);
        sendResponse({ ok: true });
      } catch (error) {
        console.error('DropCal: Failed to set primary', error);
        sendResponse({ ok: false, error: 'Failed to set primary provider' });
      }
    });
    return true;
  }

  // Settings — disconnect calendar provider
  if (message.type === 'DISCONNECT_PROVIDER') {
    ensureAuth().then(async (hasAuth) => {
      if (!hasAuth) {
        sendResponse({ ok: false, error: 'Not authenticated' });
        return;
      }
      try {
        await disconnectCalendarProvider(message.provider);
        sendResponse({ ok: true });
      } catch (error) {
        console.error('DropCal: Failed to disconnect', error);
        sendResponse({ ok: false, error: 'Failed to disconnect provider' });
      }
    });
    return true;
  }

  // Popup — dismiss session feedback
  if (message.type === 'DISMISS_SESSION') {
    const { sessionId } = message;
    Promise.all([
      removeNotification(sessionId),
      updateSessionRecord(sessionId, { dismissedAt: Date.now() }),
    ]).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Sidebar — push all session events to calendar
  if (message.type === 'PUSH_ALL_EVENTS') {
    const { sessionId } = message;
    (async () => {
      const hasAuth = await ensureAuth();
      if (!hasAuth) return { ok: false, error: 'Not authenticated' };

      const history = await getHistory();
      const session = history.sessions.find((s) => s.sessionId === sessionId);
      const eventIds = (session?.events || [])
        .map((e) => e.id)
        .filter((id): id is string => !!id);

      if (eventIds.length === 0) return { ok: false, error: 'No events to add' };

      const result = await pushEvents(sessionId, eventIds);
      if (result.success) {
        await updateSessionRecord(sessionId, { addedToCalendar: true });
      }
      return { ok: result.success, message: result.message };
    })()
      .then((resp) => sendResponse(resp))
      .catch((error) => {
        console.error('DropCal: Push events failed', error);
        sendResponse({ ok: false, error: 'Failed to add events to calendar' });
      });
    return true;
  }

  // Settings — sign out (user-initiated)
  if (message.type === 'SIGN_OUT') {
    clearAuth().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

// ===== Notification Click =====

notifications.onClicked.addListener(async (notificationId: string) => {
  if (!notificationId.startsWith('dropcal-')) return;
  const sessionId = notificationId.replace('dropcal-', '');
  storage.session.set({ sidebarSessionId: sessionId });
  // Notification click is a user gesture — open session in DropCal instead
  // (sidePanel.open from service worker without user gesture context is unreliable)
  const url = `${DROPCAL_URL}/s/${sessionId}`;
  api.tabs.create({ url });
});
