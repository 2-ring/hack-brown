import type { SessionRecord } from '../types';
import { initTheme } from '../theme';

const API_URL = 'https://api.dropcal.ai';

// ===== View State Machine =====
// 'processing' reuses the input view with the animated drop zone border.
// Success/error feedback is shown inline in the drop zone (green/red border).

type View = 'auth' | 'input' | 'processing' | 'settings';

let currentView: View = 'auth';
const viewAuth = document.getElementById('view-auth')!;
const viewInput = document.getElementById('view-input')!;
const viewSettings = document.getElementById('view-settings')!;
const popupHeader = document.getElementById('popup-header')!;
const dropZone = document.getElementById('drop-zone')!;
const dropZoneContent = document.getElementById('drop-zone-content')!;
const dropZoneSuccess = document.getElementById('drop-zone-success')!;
const dropZoneError = document.getElementById('drop-zone-error')!;
const feedbackActions = document.getElementById('feedback-actions')!;

const allViews = [viewAuth, viewInput, viewSettings];

function resetDropZone(): void {
  dropZone.classList.remove('processing', 'success', 'error');
  dropZoneContent.classList.remove('hidden');
  dropZoneSuccess.classList.add('hidden');
  dropZoneError.classList.add('hidden');
  feedbackActions.classList.add('hidden');
}

function showView(view: View): void {
  for (const v of allViews) v.classList.add('hidden');
  popupHeader.classList.toggle('hidden', view === 'auth' || view === 'settings');

  // Lock body to fixed height for views with scrollable content
  document.body.classList.toggle('view-locked', view === 'input' || view === 'processing');

  if (view === 'auth') {
    viewAuth.classList.remove('hidden');
  } else if (view === 'input') {
    viewInput.classList.remove('hidden');
    resetDropZone();
  } else if (view === 'processing') {
    viewInput.classList.remove('hidden');
    resetDropZone();
    dropZone.classList.add('processing');
  } else if (view === 'settings') {
    viewSettings.classList.remove('hidden');
  }

  currentView = view;
}

// ===== Header =====

const headerBrand = document.getElementById('header-brand')!;

headerBrand.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://dropcal.ai' });
});

const btnSettings = document.getElementById('btn-settings')!;

btnSettings.addEventListener('click', () => {
  previousView = currentView as Exclude<View, 'settings'>;
  showView('settings');
  settingsSubView = 'main';
  showSettingsSubView('main');
  loadSettingsData();
});

// ============================================================
// View: Auth
// ============================================================

const btnSignin = document.getElementById('btn-signin')!;

btnSignin.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SIGN_IN' });
  window.close();
});

// ============================================================
// View: Input
// ============================================================

// ----- DOM refs -----

const btnLink = document.getElementById('btn-link')!;
const btnImages = document.getElementById('btn-images')!;
const btnFiles = document.getElementById('btn-files')!;
const btnCenter = document.getElementById('btn-center')!;
const btnAudio = document.getElementById('btn-audio')!;
const btnText = document.getElementById('btn-text')!;
const btnEmail = document.getElementById('btn-email')!;

const allButtons = [btnLink, btnImages, btnFiles, btnCenter, btnAudio, btnText, btnEmail];

const resultsSection = document.getElementById('results-section')!;
const resultsList = document.getElementById('results-list')!;

// ----- Button handlers -----

// Stop button clicks from bubbling to drop zone
for (const btn of allButtons) {
  btn.addEventListener('click', (e) => e.stopPropagation());
}

function openDropcal(mode?: string): void {
  const url = mode ? `https://dropcal.ai?input=${mode}` : 'https://dropcal.ai';
  chrome.tabs.create({ url });
  window.close();
}

btnLink.addEventListener('click', () => openDropcal('link'));
btnImages.addEventListener('click', () => openDropcal());
btnFiles.addEventListener('click', () => openDropcal());
btnCenter.addEventListener('click', () => openDropcal());
btnAudio.addEventListener('click', () => openDropcal('audio'));
btnText.addEventListener('click', () => openDropcal('text'));
btnEmail.addEventListener('click', () => openDropcal('email'));

// ----- Drag & drop -----

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('dragging');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('dragging');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('dragging');

  const dt = e.dataTransfer;
  if (!dt) return;

  if (dt.files && dt.files.length > 0) {
    handleFiles(dt.files);
    return;
  }

  const text = dt.getData('text/plain');
  if (text && text.trim()) submitText(text.trim());
});

// ----- Global paste -----

document.addEventListener('paste', (e) => {
  if (currentView !== 'input') return;
  const cd = e.clipboardData;
  if (!cd) return;

  if (cd.files && cd.files.length > 0) {
    handleFiles(cd.files);
    return;
  }

  const text = cd.getData('text/plain');
  if (text && text.trim()) submitText(text.trim());
});

// ----- History rendering -----

// Phosphor icon font class for backend icon names (kebab-case → ph-{name})
// Falls back to inputType-based Phosphor class
const INPUT_TYPE_ICON: Record<SessionRecord['inputType'], string> = {
  text: 'ph-pencil-simple',
  image: 'ph-images',
  page: 'ph-globe',
  file: 'ph-files',
};

function getIconClass(session: SessionRecord): string {
  if (session.icon) return `ph-${session.icon}`;
  return INPUT_TYPE_ICON[session.inputType] || INPUT_TYPE_ICON.text;
}

// Track titles we've already animated so we only animate once per session
const animatedTitles = new Set<string>();
// Track previous titles to detect when a title first appears
const prevTitles = new Map<string, string | null>();

function animateTitle(el: HTMLElement, text: string, speed = 25): void {
  let i = 0;
  el.textContent = '';
  el.classList.add('typing-cursor');
  const interval = setInterval(() => {
    if (i < text.length) {
      el.textContent = text.substring(0, ++i);
    } else {
      clearInterval(interval);
      el.classList.remove('typing-cursor');
    }
  }, speed);
}

function getTimeGroup(createdAt: number): string {
  const now = new Date();
  const daysDiff = Math.floor(
    (now.getTime() - createdAt) / (1000 * 60 * 60 * 24),
  );

  if (daysDiff === 0) return 'Today';
  if (daysDiff === 1) return 'Yesterday';
  if (daysDiff <= 7) return '7 Days';
  if (daysDiff <= 30) return '30 Days';
  return 'Older';
}

function filterSessions(sessions: SessionRecord[]): SessionRecord[] {
  return sessions.filter((session) => {
    if (session.status === 'error') return false;
    if (session.status === 'polling') return true;
    return session.eventCount > 0;
  });
}

function renderSkeletons(count = 5): void {
  resultsSection.classList.remove('hidden');
  resultsList.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'skeleton-row';
    row.innerHTML = '<div class="skeleton-icon"></div><div class="skeleton-title"></div>';
    resultsList.appendChild(row);
  }
}

function renderHistory(sessions: SessionRecord[]): void {
  const visible = filterSessions(sessions);

  if (visible.length === 0) {
    resultsSection.classList.add('hidden');
    return;
  }

  resultsSection.classList.remove('hidden');
  resultsList.innerHTML = '';

  // Group sessions by time period
  const groups = new Map<string, SessionRecord[]>();
  const groupOrder = ['Today', 'Yesterday', '7 Days', '30 Days', 'Older'];

  for (const session of visible) {
    const group = getTimeGroup(session.createdAt);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(session);
  }

  for (const groupName of groupOrder) {
    const groupSessions = groups.get(groupName);
    if (!groupSessions || groupSessions.length === 0) continue;

    const groupEl = document.createElement('div');
    groupEl.className = 'session-group';

    const label = document.createElement('div');
    label.className = 'session-group-label';
    label.textContent = groupName;
    groupEl.appendChild(label);

    for (const session of groupSessions) {
      const row = document.createElement('div');
      row.className = 'session-row';
      row.addEventListener('click', () => openSidebar(session.sessionId));

      // Icon: use Phosphor font class from backend icon or inputType fallback
      const icon = document.createElement('i');
      icon.className = `session-icon ph ${getIconClass(session)}`;

      // Title with skeleton / typing animation
      const title = document.createElement('div');
      title.className = 'session-row-title';

      if (session.status === 'polling' && !session.title) {
        // Skeleton title for processing sessions without a title yet
        title.innerHTML = '<div class="skeleton-title"></div>';
      } else if (session.title) {
        const prev = prevTitles.get(session.sessionId);
        const shouldAnimate = prev === null && !animatedTitles.has(session.sessionId);

        if (shouldAnimate) {
          animatedTitles.add(session.sessionId);
          animateTitle(title, session.title);
        } else {
          title.textContent = session.title;
        }
      } else {
        title.textContent = 'Untitled';
      }

      if (session.status === 'polling') title.classList.add('processing');

      row.appendChild(icon);
      row.appendChild(title);

      // Right indicator
      if (session.status === 'polling') {
        const pulse = document.createElement('div');
        pulse.className = 'processing-indicator';
        row.appendChild(pulse);
      } else if (session.eventCount > 0) {
        const badge = document.createElement('div');
        badge.className = `event-count-badge${session.addedToCalendar ? '' : ' unsynced'}`;
        badge.textContent = String(session.eventCount);
        row.appendChild(badge);
      }

      groupEl.appendChild(row);
    }

    resultsList.appendChild(groupEl);
  }

  // Update previous titles for next render
  for (const session of sessions) {
    prevTitles.set(session.sessionId, session.title);
  }
}

// ============================================================
// Inline Feedback (shown inside drop zone)
// ============================================================

const feedbackIcon = document.getElementById('feedback-icon')!;
const feedbackTitle = document.getElementById('feedback-title')!;
const feedbackSubtitle = document.getElementById('feedback-subtitle')!;
const feedbackErrorIcon = document.getElementById('feedback-error-icon')!;
const feedbackErrorTitle = document.getElementById('feedback-error-title')!;
const feedbackErrorSubtitle = document.getElementById('feedback-error-subtitle')!;
const btnDismissSuccess = document.getElementById('btn-dismiss-success')!;
const btnDismissError = document.getElementById('btn-dismiss-error')!;

let feedbackSessionId: string | null = null;

// Sessions dismissed in this popup lifetime (guards against async race with storage)
const locallyDismissed = new Set<string>();

// Feedback auto-expires after 24 hours even if not dismissed
const FEEDBACK_EXPIRY_MS = 24 * 60 * 60 * 1000;

function shouldShowFeedback(session: SessionRecord): boolean {
  if (session.status !== 'processed' && session.status !== 'error') return false;
  if (session.dismissedAt) return false;
  if (locallyDismissed.has(session.sessionId)) return false;
  if (Date.now() - session.createdAt > FEEDBACK_EXPIRY_MS) return false;
  return true;
}

// Walk the notification queue newest-first and return the first valid session.
function findPendingNotification(sessions: SessionRecord[], queue: string[]): SessionRecord | null {
  for (let i = queue.length - 1; i >= 0; i--) {
    const session = sessions.find((s) => s.sessionId === queue[i]);
    if (session && shouldShowFeedback(session)) return session;
  }
  return null;
}

function showFeedbackSuccess(session: SessionRecord): void {
  feedbackSessionId = session.sessionId;

  // Set icon to session icon or fallback to checkmark
  if (session.icon) {
    feedbackIcon.className = `ph-duotone ph-${session.icon} feedback-icon feedback-icon-success`;
  } else {
    feedbackIcon.className = 'ph-duotone ph-check-fat feedback-icon feedback-icon-success';
  }

  const count = session.eventCount;
  feedbackTitle.textContent = count === 1 ? '1 Event Scheduled' : `${count} Events Scheduled`;
  feedbackSubtitle.textContent = session.title || '';
  feedbackSubtitle.classList.toggle('hidden', !session.title);

  // Swap drop zone to success state
  dropZone.classList.remove('processing', 'error');
  dropZone.classList.add('success');
  dropZoneContent.classList.add('hidden');
  dropZoneError.classList.add('hidden');
  dropZoneSuccess.classList.remove('hidden');

  // Show action buttons below drop zone
  btnDismissSuccess.classList.remove('hidden');
  btnDismissError.classList.add('hidden');
  feedbackActions.classList.remove('hidden');

  // Ensure input view is visible
  viewInput.classList.remove('hidden');
  popupHeader.classList.remove('hidden');
  currentView = 'input';
}

function showErrorState(): void {
  dropZone.classList.remove('processing', 'success');
  dropZone.classList.add('error');
  dropZoneContent.classList.add('hidden');
  dropZoneSuccess.classList.add('hidden');
  dropZoneError.classList.remove('hidden');

  btnDismissSuccess.classList.add('hidden');
  btnDismissError.classList.remove('hidden');
  feedbackActions.classList.remove('hidden');

  viewInput.classList.remove('hidden');
  popupHeader.classList.remove('hidden');
  currentView = 'input';
}

function showFeedbackError(message: string): void {
  feedbackSessionId = null;
  feedbackErrorIcon.className = 'ph-duotone ph-warning-circle feedback-icon feedback-icon-error';
  feedbackErrorTitle.textContent = message;
  feedbackErrorSubtitle.textContent = '';
  feedbackErrorSubtitle.classList.add('hidden');
  showErrorState();
}

function showSessionError(session: SessionRecord): void {
  feedbackSessionId = session.sessionId;

  if (session.status === 'processed' && session.eventCount === 0) {
    feedbackErrorIcon.className = 'ph-duotone ph-calendar-blank feedback-icon feedback-icon-error';
    feedbackErrorTitle.textContent = 'No Events Found';
    feedbackErrorSubtitle.textContent = session.title || 'No calendar events were detected.';
  } else {
    feedbackErrorIcon.className = 'ph-duotone ph-warning-circle feedback-icon feedback-icon-error';
    feedbackErrorTitle.textContent = 'Processing Failed';
    feedbackErrorSubtitle.textContent = session.errorMessage || '';
  }
  feedbackErrorSubtitle.classList.toggle('hidden', !feedbackErrorSubtitle.textContent);
  showErrorState();
}

function showPendingFeedback(session: SessionRecord): void {
  if (session.status === 'error' || session.eventCount === 0) {
    showSessionError(session);
  } else {
    showFeedbackSuccess(session);
  }
}

dropZone.addEventListener('click', async () => {
  if (dropZone.classList.contains('success') && feedbackSessionId) {
    const sid = feedbackSessionId;
    feedbackSessionId = null;
    locallyDismissed.add(sid);
    await openSidebar(sid);
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'DISMISS_SESSION', sessionId: sid }, () => resolve());
    });
    window.close();
  } else if (dropZone.classList.contains('error') && feedbackSessionId) {
    locallyDismissed.add(feedbackSessionId);
    chrome.runtime.sendMessage({ type: 'DISMISS_SESSION', sessionId: feedbackSessionId });
    feedbackSessionId = null;
    showView('input');
    refresh();
  }
});

btnDismissSuccess.addEventListener('click', (e) => {
  e.stopPropagation();
  if (feedbackSessionId) {
    locallyDismissed.add(feedbackSessionId);
    chrome.runtime.sendMessage({ type: 'DISMISS_SESSION', sessionId: feedbackSessionId });
  }
  feedbackSessionId = null;
  showView('input');
  refresh();
});

btnDismissError.addEventListener('click', () => {
  if (feedbackSessionId) {
    locallyDismissed.add(feedbackSessionId);
    chrome.runtime.sendMessage({ type: 'DISMISS_SESSION', sessionId: feedbackSessionId });
    feedbackSessionId = null;
  }
  showView('input');
  refresh();
});

// ============================================================
// View: Settings
// ============================================================

// ----- Settings state -----

type SettingsSubView = 'main' | 'integrations' | 'disconnect';
let settingsSubView: SettingsSubView = 'main';
let settingsDateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' = 'MM/DD/YYYY';
let settingsThemeMode: 'auto' | 'light' | 'dark' = 'auto';
let settingsProviders: Array<{
  provider: 'google' | 'microsoft' | 'apple';
  email: string;
  connected: boolean;
  is_primary: boolean;
}> = [];
let settingsPlan: 'free' | 'pro' = 'free';
let previousView: View = 'input';

// ----- Settings DOM refs -----

const settingsBackBtn = document.getElementById('settings-back-btn')!;
const settingsUserEmailEl = document.getElementById('settings-user-email')!;
const settingsMain = document.getElementById('settings-main')!;
const settingsIntegrationsView = document.getElementById('settings-integrations-view')!;
const settingsProvidersList = document.getElementById('settings-providers-list')!;
const settingsUpgrade = document.getElementById('settings-upgrade')!;
const settingsDateFormatBtn = document.getElementById('settings-date-format')!;
const settingsDateIcon = document.getElementById('settings-date-icon')!;
const settingsDateValue = document.getElementById('settings-date-value')!;
const settingsThemeBtn = document.getElementById('settings-theme')!;
const settingsThemeIcon = document.getElementById('settings-theme-icon')!;
const settingsThemeLabel = document.getElementById('settings-theme-label')!;
const settingsIntegrationsBtn = document.getElementById('settings-integrations-btn')!;
const settingsLogout = document.getElementById('settings-logout')!;
const settingsDisconnectBtn = document.getElementById('settings-disconnect-btn')!;
const settingsDisconnectBack = document.getElementById('settings-disconnect-back')!;

// ----- Settings functions -----

function showSettingsSubView(sub: SettingsSubView): void {
  settingsSubView = sub;

  // Toggle main vs integrations menu
  settingsMain.classList.toggle('hidden', sub !== 'main');
  settingsIntegrationsView.classList.toggle('hidden', sub === 'main');

  // Footer button visibility
  settingsLogout.classList.toggle('hidden', sub !== 'main');
  settingsDisconnectBtn.classList.toggle('hidden', sub !== 'integrations');
  settingsDisconnectBack.classList.toggle('hidden', sub !== 'disconnect');
}

function loadSettingsData(): void {
  chrome.runtime.sendMessage({ type: 'GET_USER_PROFILE' }, (response) => {
    if (response?.ok && response.profile) {
      const p = response.profile;
      settingsUserEmailEl.textContent = p.email || '';
      settingsPlan = p.plan === 'pro' ? 'pro' : 'free';
      settingsDateFormat = p.preferences?.date_format === 'DD/MM/YYYY' ? 'DD/MM/YYYY' : 'MM/DD/YYYY';
      settingsThemeMode = (['auto', 'light', 'dark'].includes(p.preferences?.theme_mode) ? p.preferences.theme_mode : 'auto') as 'auto' | 'light' | 'dark';

      // Update upgrade button text based on plan
      const upgradeSpan = settingsUpgrade.querySelector('span')!;
      upgradeSpan.textContent = settingsPlan === 'pro' ? 'Manage subscription' : 'Upgrade plan';

      updateDateFormatUI();
      updateThemeUI();
    }
  });
}

function updateDateFormatUI(): void {
  settingsDateValue.textContent = settingsDateFormat;
  if (settingsDateFormat === 'DD/MM/YYYY') {
    settingsDateIcon.className = 'ph ph-globe-simple settings-item-icon';
  } else {
    settingsDateIcon.className = 'ph ph-football-helmet settings-item-icon';
  }
}

function updateThemeUI(): void {
  if (settingsThemeMode === 'auto') {
    settingsThemeIcon.className = 'ph ph-flashlight settings-item-icon';
    settingsThemeLabel.textContent = 'Auto theme';
  } else if (settingsThemeMode === 'dark') {
    settingsThemeIcon.className = 'ph ph-moon-stars settings-item-icon';
    settingsThemeLabel.textContent = 'Dark mode';
  } else {
    settingsThemeIcon.className = 'ph ph-sun-horizon settings-item-icon';
    settingsThemeLabel.textContent = 'Light mode';
  }
}

function loadCalendarProviders(): void {
  chrome.runtime.sendMessage({ type: 'GET_CALENDAR_PROVIDERS' }, (response) => {
    if (response?.ok && response.providers) {
      settingsProviders = response.providers;
      renderProviders();
    }
  });
}

function renderProviders(): void {
  settingsProvidersList.innerHTML = '';

  const providerDefs: Array<{
    key: 'google' | 'microsoft' | 'apple';
    name: string;
    iconClass: string;
  }> = [
    { key: 'google', name: 'Google', iconClass: 'ph ph-google-logo' },
    { key: 'microsoft', name: 'Outlook', iconClass: 'ph ph-microsoft-outlook-logo' },
    { key: 'apple', name: 'Apple', iconClass: 'ph ph-apple-logo' },
  ];

  for (const def of providerDefs) {
    const provider = settingsProviders.find(p => p.provider === def.key);
    const isConnected = provider?.connected ?? false;
    const isPrimary = provider?.is_primary ?? false;
    const inDisconnect = settingsSubView === 'disconnect';

    const row = document.createElement('button');
    row.className = 'settings-item settings-integration-row';
    if (isConnected && isPrimary && !inDisconnect) {
      row.classList.add('settings-integration-active');
    }

    const icon = document.createElement('i');
    icon.className = `${def.iconClass} settings-item-icon`;

    const info = document.createElement('div');
    info.className = 'settings-integration-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'settings-integration-name';
    nameSpan.textContent = def.name;

    const detailSpan = document.createElement('span');
    detailSpan.className = 'settings-integration-detail';

    if (!isConnected) {
      detailSpan.textContent = inDisconnect ? 'Not connected' : 'Connect';
      if (inDisconnect) {
        row.style.opacity = '0.4';
        row.style.cursor = 'default';
      }
    } else if (inDisconnect) {
      detailSpan.textContent = 'Disconnect';
      detailSpan.style.color = 'var(--error)';
    } else {
      detailSpan.textContent = provider?.email || '';
    }

    info.appendChild(nameSpan);
    info.appendChild(detailSpan);

    row.appendChild(icon);
    row.appendChild(info);

    // Right-side indicator
    if (isConnected) {
      const action = document.createElement('div');
      action.className = 'settings-integration-actions';

      if (inDisconnect) {
        const signOutIcon = document.createElement('i');
        signOutIcon.className = 'ph ph-sign-out';
        signOutIcon.style.color = 'var(--error)';
        action.appendChild(signOutIcon);
      } else {
        const starIcon = document.createElement('i');
        starIcon.className = isPrimary ? 'ph ph-star settings-star-active' : 'ph ph-star settings-star-inactive';
        action.appendChild(starIcon);
      }

      row.appendChild(action);
    }

    // Click handlers
    if (isConnected && inDisconnect) {
      row.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'DISCONNECT_PROVIDER', provider: def.key }, (resp) => {
          if (resp?.ok) loadCalendarProviders();
        });
      });
    } else if (isConnected) {
      row.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'SET_PRIMARY_PROVIDER', provider: def.key }, (resp) => {
          if (resp?.ok) {
            // Optimistic update
            for (const p of settingsProviders) {
              p.is_primary = p.provider === def.key;
            }
            renderProviders();
          }
        });
      });
    } else if (!inDisconnect) {
      // Not connected — open dropcal.ai to connect
      row.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://dropcal.ai' });
      });
    }

    settingsProvidersList.appendChild(row);
  }
}

// ----- Settings event listeners -----

settingsBackBtn.addEventListener('click', () => {
  if (settingsSubView === 'integrations' || settingsSubView === 'disconnect') {
    showSettingsSubView('main');
  } else {
    showView(previousView);
    if (previousView === 'input') refresh();
  }
});

settingsUpgrade.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://dropcal.ai/plans' });
});

settingsDateFormatBtn.addEventListener('click', () => {
  settingsDateFormat = settingsDateFormat === 'MM/DD/YYYY' ? 'DD/MM/YYYY' : 'MM/DD/YYYY';
  updateDateFormatUI();
  chrome.runtime.sendMessage({
    type: 'UPDATE_PREFERENCES',
    preferences: { date_format: settingsDateFormat },
  });
});

// Theme toggle: auto → light → dark → auto
settingsThemeBtn.addEventListener('click', () => {
  const cycle: Array<'auto' | 'light' | 'dark'> = ['auto', 'light', 'dark'];
  const idx = cycle.indexOf(settingsThemeMode);
  settingsThemeMode = cycle[(idx + 1) % 3];
  updateThemeUI();
  chrome.runtime.sendMessage({
    type: 'UPDATE_PREFERENCES',
    preferences: { theme_mode: settingsThemeMode },
  });
});

settingsIntegrationsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://dropcal.ai/?settings=integrations' });
  window.close();
});

settingsLogout.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => {
    showView('auth');
  });
});

settingsDisconnectBtn.addEventListener('click', () => {
  showSettingsSubView('disconnect');
  renderProviders();
});

settingsDisconnectBack.addEventListener('click', () => {
  showSettingsSubView('integrations');
  renderProviders();
});

// ============================================================
// Shared Helpers
// ============================================================

function submitText(text: string): void {
  showView('processing');
  chrome.runtime.sendMessage({ type: 'SUBMIT_TEXT', text }, (response) => {
    if (response && !response.ok) {
      showFeedbackError(response.error || 'Failed to process text');
    } else {
      window.close();
    }
  });
}

async function handleFiles(files: FileList): Promise<void> {
  showView('processing');

  const authResult = await chrome.storage.local.get('auth');
  const token = authResult.auth?.accessToken;
  if (!token) {
    showFeedbackError('Not authenticated. Please sign in.');
    return;
  }

  for (const file of Array.from(files)) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Upload failed' }));
        showFeedbackError(err.error || `Upload failed (${response.status})`);
        return;
      }

      const { session } = await response.json();

      // Tell background to track and poll this session (lightweight message, no file data)
      chrome.runtime.sendMessage({
        type: 'TRACK_SESSION',
        sessionId: session.id,
        inputType: file.type.startsWith('image/') ? 'image' : 'file',
      });
    } catch {
      showFeedbackError('Failed to upload file');
      return;
    }
  }

  window.close();
}

async function openSidebar(sessionId: string): Promise<void> {
  await chrome.storage.session.set({ sidebarSessionId: sessionId });
  const win = await chrome.windows.getCurrent();
  if (win.id) {
    await (chrome.sidePanel as any).open({ windowId: win.id });
  }
}

// ============================================================
// Notification State (controls drop zone feedback, independent of session list)
// ============================================================

function syncNotifications(sessions: SessionRecord[], queue: string[]): void {
  if (currentView === 'processing') {
    const pending = findPendingNotification(sessions, queue);
    if (pending) {
      showPendingFeedback(pending);
      return;
    }
    if (!sessions.some((s) => s.status === 'polling')) {
      const newest = sessions[0];
      if (newest && (newest.status === 'error' || (newest.status === 'processed' && newest.eventCount === 0))) {
        showSessionError(newest);
      } else {
        showView('input');
      }
    }
    return;
  }

  if (currentView === 'input') {
    const pending = findPendingNotification(sessions, queue);
    if (pending && feedbackSessionId !== pending.sessionId) {
      showPendingFeedback(pending);
    }
  }
}

// ============================================================
// Refresh — reads storage once, updates session list + notifications independently
// ============================================================

function refresh(): void {
  chrome.storage.local.get(['sessionHistory', 'notificationQueue'], (result) => {
    const sessions =
      (result.sessionHistory as { sessions: SessionRecord[] } | undefined)?.sessions || [];
    const queue: string[] = result.notificationQueue || [];
    renderHistory(sessions);
    syncNotifications(sessions, queue);
  });
}

// ============================================================
// Storage Listeners
// ============================================================

chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.sessionHistory || changes.notificationQueue) {
    refresh();
  }
  if (changes.auth) {
    chrome.runtime.sendMessage({ type: 'GET_AUTH' }, (response) => {
      if (response?.isAuthenticated) {
        showView('input');
        refresh();
      } else {
        showView('auth');
      }
    });
  }
});

chrome.storage.session.onChanged.addListener(() => {
  refresh();
});

// ============================================================
// Init
// ============================================================

initTheme();

chrome.runtime.sendMessage({ type: 'GET_AUTH' }, (response) => {
  const isAuth = response?.isAuthenticated ?? false;
  if (!isAuth) {
    showView('auth');
    return;
  }

  // Show skeleton while loading initial history
  showView('input');
  renderSkeletons();

  chrome.storage.local.get(['sessionHistory', 'notificationQueue'], (result) => {
    const sessions =
      (result.sessionHistory as { sessions: SessionRecord[] } | undefined)?.sessions || [];
    const queue: string[] = result.notificationQueue || [];

    // Seed prevTitles so existing titles don't animate on first load
    for (const s of sessions) {
      prevTitles.set(s.sessionId, s.title);
      if (s.title) animatedTitles.add(s.sessionId);
    }

    // Set initial view: polling → processing, pending notification → feedback, else → input
    if (sessions.some((s) => s.status === 'polling')) {
      showView('processing');
    } else {
      const pending = findPendingNotification(sessions, queue);
      if (pending) {
        for (const v of allViews) v.classList.add('hidden');
        showPendingFeedback(pending);
      } else {
        showView('input');
      }
    }

    // Render session list (independent of notification state above)
    renderHistory(sessions);
  });
});
