import type { SessionRecord } from '../types';
import { initTheme } from '../theme';

// ===== View State Machine =====

type View = 'auth' | 'input' | 'processing' | 'feedback';

let currentView: View = 'auth';

const viewAuth = document.getElementById('view-auth')!;
const viewInput = document.getElementById('view-input')!;
const viewProcessing = document.getElementById('view-processing')!;
const viewFeedback = document.getElementById('view-feedback')!;
const popupHeader = document.getElementById('popup-header')!;

const allViews = [viewAuth, viewInput, viewProcessing, viewFeedback];

function showView(view: View): void {
  for (const v of allViews) v.classList.add('hidden');
  popupHeader.classList.toggle('hidden', view === 'auth');

  if (view === 'auth') viewAuth.classList.remove('hidden');
  else if (view === 'input') viewInput.classList.remove('hidden');
  else if (view === 'processing') viewProcessing.classList.remove('hidden');
  else if (view === 'feedback') viewFeedback.classList.remove('hidden');

  currentView = view;
}

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

const dropZone = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const imageInput = document.getElementById('image-input') as HTMLInputElement;
const docInput = document.getElementById('doc-input') as HTMLInputElement;

const btnLink = document.getElementById('btn-link')!;
const btnImages = document.getElementById('btn-images')!;
const btnFiles = document.getElementById('btn-files')!;
const btnCenter = document.getElementById('btn-center')!;
const btnCapture = document.getElementById('btn-capture')!;
const btnPaste = document.getElementById('btn-paste')!;
const btnEmail = document.getElementById('btn-email')!;

const allButtons = [btnLink, btnImages, btnFiles, btnCenter, btnCapture, btnPaste, btnEmail];

const resultsSection = document.getElementById('results-section')!;
const resultsList = document.getElementById('results-list')!;
const activeProcessingEl = document.getElementById('active-processing')!;

// ----- Button handlers -----

// Stop button clicks from bubbling to drop zone
for (const btn of allButtons) {
  btn.addEventListener('click', (e) => e.stopPropagation());
}

btnLink.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) submitText(text.trim());
  } catch {
    // Clipboard access denied
  }
});

btnImages.addEventListener('click', () => imageInput.click());
btnFiles.addEventListener('click', () => docInput.click());
btnCenter.addEventListener('click', () => fileInput.click());

btnCapture.addEventListener('click', () => {
  showView('processing');
  chrome.runtime.sendMessage({ type: 'CAPTURE_PAGE' }, (response) => {
    if (response && !response.ok) {
      showFeedbackError(response.error || 'Capture failed');
    }
  });
});

btnPaste.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) submitText(text.trim());
  } catch {
    // Clipboard access denied
  }
});

btnEmail.addEventListener('click', () => {
  // TODO: email forwarding flow
});

// ----- File inputs -----

fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) { handleFiles(fileInput.files); fileInput.value = ''; }
});

imageInput.addEventListener('change', () => {
  if (imageInput.files?.length) { handleFiles(imageInput.files); imageInput.value = ''; }
});

docInput.addEventListener('change', () => {
  if (docInput.files?.length) { handleFiles(docInput.files); docInput.value = ''; }
});

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

const INPUT_ICONS: Record<SessionRecord['inputType'], string> = {
  text: '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M221.66,90.34,192,120,136,64l29.66-29.66a8,8,0,0,1,11.31,0L221.66,79A8,8,0,0,1,221.66,90.34Z" opacity="0.2"/><path d="M227.32,73.37,182.63,28.69a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31l83.67-83.66,3.48,13.9-36.8,36.79a8,8,0,0,0,11.31,11.32l40-40a8,8,0,0,0,2.11-7.6l-6.9-27.61L227.32,96A16,16,0,0,0,227.32,73.37ZM48,208V179.31L76.69,208Zm48-3.31L51.31,160,136,75.31,180.69,120Zm96-96L147.32,64l24-24L216,84.69Z"/></svg>',
  image: '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M224,56v82.06l-23.72-23.72a8,8,0,0,0-11.31,0L163.31,140,113.66,90.34a8,8,0,0,0-11.32,0L64,128.69V56a8,8,0,0,1,8-8H216A8,8,0,0,1,224,56Z" opacity="0.2"/><path d="M216,40H72A16,16,0,0,0,56,56V72H40A16,16,0,0,0,24,88V200a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V184h16a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM72,56H216v62.75l-10.07-10.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L72,109.37ZM184,200H40V88H56v80a16,16,0,0,0,16,16H184Zm32-32H72V132l36-36,49.66,49.66a8,8,0,0,0,11.31,0L194.63,120,216,141.38V168ZM160,84a12,12,0,1,1,12,12A12,12,0,0,1,160,84Z"/></svg>',
  page: '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.62,87.62,0,0,1-6.4,32.94l-44.7-27.49a15.92,15.92,0,0,0-6.24-2.23l-22.82-3.08a16.11,16.11,0,0,0-16,7.86h-8.72l-3.8-7.86a16,16,0,0,0-11.09-8.48L74.34,116l12.74-26.29a16,16,0,0,0-1.27-16.06l-3.75-5.51A87.46,87.46,0,0,1,128,56a88.44,88.44,0,0,1,13.8,1.08l-4.26,14.61a16,16,0,0,0,4.06,15.63l10.52,10.52a16,16,0,0,0,9.79,4.68l19.54,1.62L196,118.54A16.07,16.07,0,0,0,216,128ZM40,128A87.44,87.44,0,0,1,67,56.79L71,62.4,58.31,88.68a16,16,0,0,0,1.08,15.78l9.58,14.18a16,16,0,0,0,11.09,6.9l21.91,3.61,3.8,7.86a16.07,16.07,0,0,0,14.37,9h1.83l-4.35,42.08a87.48,87.48,0,0,1-5.81,1.28A88.14,88.14,0,0,1,40,128Zm87.83,87.91,4.67-45.12a16,16,0,0,0-10.44-16.89L109,149.53l14.25-3.56a16,16,0,0,0,8.23-5.49l7.13-8.56,22.81,3.08,44.71,27.5A87.51,87.51,0,0,1,127.83,215.91Z"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M208,88H152V32Z" opacity="0.2"/><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/></svg>',
};

function getTimeGroup(createdAt: number): string {
  const now = new Date();
  const date = new Date(createdAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (sessionDay >= today) return 'Today';
  if (sessionDay >= yesterday) return 'Yesterday';
  const diffDays = Math.floor((today.getTime() - sessionDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return '7 Days';
  if (diffDays <= 30) return '30 Days';
  return 'Older';
}

function renderHistory(sessions: SessionRecord[]): void {
  const hasPolling = sessions.some((s) => s.status === 'polling');
  activeProcessingEl.classList.toggle('hidden', !hasPolling);

  if (sessions.length === 0) {
    resultsSection.classList.add('hidden');
    return;
  }

  resultsSection.classList.remove('hidden');
  resultsList.innerHTML = '';

  // Group sessions by time period
  const groups = new Map<string, SessionRecord[]>();
  const groupOrder = ['Today', 'Yesterday', '7 Days', '30 Days', 'Older'];

  for (const session of sessions) {
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

      // Input type icon
      const icon = document.createElement('div');
      icon.className = 'session-icon';
      icon.innerHTML = INPUT_ICONS[session.inputType] || INPUT_ICONS.text;

      // Title
      const title = document.createElement('div');
      title.className = 'session-row-title';
      if (session.status === 'polling') title.classList.add('processing');
      title.textContent = session.title || 'Untitled';

      row.appendChild(icon);
      row.appendChild(title);

      // Right indicator
      if (session.status === 'polling') {
        const pulse = document.createElement('div');
        pulse.className = 'processing-indicator';
        row.appendChild(pulse);
      } else if (session.eventCount > 0) {
        const badge = document.createElement('div');
        badge.className = 'event-count-badge';
        badge.textContent = String(session.eventCount);
        row.appendChild(badge);
      }

      groupEl.appendChild(row);
    }

    resultsList.appendChild(groupEl);
  }
}

// ============================================================
// View: Processing
// ============================================================

// Purely visual — no interactive elements.
// Storage listener watches for session completion → switches to feedback.

// ============================================================
// View: Feedback
// ============================================================

const feedbackSuccess = document.getElementById('feedback-success')!;
const feedbackError = document.getElementById('feedback-error')!;
const feedbackTitle = document.getElementById('feedback-title')!;
const feedbackSubtitle = document.getElementById('feedback-subtitle')!;
const feedbackErrorText = document.getElementById('feedback-error-text')!;
const btnOpenSession = document.getElementById('btn-open-session')!;
const btnDismissSuccess = document.getElementById('btn-dismiss-success')!;
const btnDismissError = document.getElementById('btn-dismiss-error')!;

let feedbackSessionId: string | null = null;

function showFeedbackSuccess(session: SessionRecord): void {
  feedbackSessionId = session.sessionId;
  feedbackSuccess.classList.remove('hidden');
  feedbackError.classList.add('hidden');

  const count = session.eventCount;
  feedbackTitle.textContent = count === 1 ? '1 Event Scheduled' : `${count} Events Scheduled`;
  feedbackSubtitle.textContent = session.title || '';
  feedbackSubtitle.classList.toggle('hidden', !session.title);

  showView('feedback');
}

function showFeedbackError(message: string): void {
  feedbackSessionId = null;
  feedbackSuccess.classList.add('hidden');
  feedbackError.classList.remove('hidden');
  feedbackErrorText.textContent = message;

  showView('feedback');
}

btnOpenSession.addEventListener('click', () => {
  if (feedbackSessionId) openSidebar(feedbackSessionId);
});

btnDismissSuccess.addEventListener('click', () => {
  showView('input');
  loadHistory();
});

btnDismissError.addEventListener('click', () => {
  showView('input');
  loadHistory();
});

// ============================================================
// Shared Helpers
// ============================================================

function submitText(text: string): void {
  showView('processing');
  chrome.runtime.sendMessage({ type: 'SUBMIT_TEXT', text }, (response) => {
    if (response && !response.ok) {
      showFeedbackError(response.error || 'Failed to process text');
    }
  });
}

function handleFiles(files: FileList): void {
  showView('processing');
  for (const file of Array.from(files)) {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const data = Array.from(new Uint8Array(arrayBuffer));
      chrome.runtime.sendMessage({
        type: 'SUBMIT_FILE',
        data,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
      }, (response) => {
        if (response && !response.ok) {
          showFeedbackError(response.error || 'Failed to upload file');
        }
      });
    };
    reader.readAsArrayBuffer(file);
  }
}

async function openSidebar(sessionId: string): Promise<void> {
  await chrome.storage.session.set({ sidebarSessionId: sessionId });
  const win = await chrome.windows.getCurrent();
  if (win.id) {
    await (chrome.sidePanel as any).open({ windowId: win.id });
  }
}

// ============================================================
// Storage Listeners
// ============================================================

function onHistoryUpdate(sessions: SessionRecord[]): void {
  if (currentView === 'processing') {
    // Watch for the most recent session to complete
    const newest = sessions[0];
    if (newest) {
      if (newest.status === 'processed') {
        showFeedbackSuccess(newest);
        return;
      }
      if (newest.status === 'error') {
        showFeedbackError(newest.errorMessage || 'Processing failed');
        return;
      }
    }
    // Still polling — stay in processing
    return;
  }

  if (currentView === 'input') {
    renderHistory(sessions);
  }
}

chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.sessionHistory) {
    const sessions =
      (changes.sessionHistory.newValue as { sessions: SessionRecord[] } | undefined)?.sessions || [];
    onHistoryUpdate(sessions);
  }
  if (changes.auth) {
    chrome.runtime.sendMessage({ type: 'GET_AUTH' }, (response) => {
      if (response?.isAuthenticated) {
        showView('input');
        loadHistory();
      } else {
        showView('auth');
      }
    });
  }
});

chrome.storage.session.onChanged.addListener(() => {
  loadHistory();
});

// ============================================================
// Init
// ============================================================

initTheme();

function loadHistory(): void {
  chrome.storage.local.get('sessionHistory', (result) => {
    const sessions =
      (result.sessionHistory as { sessions: SessionRecord[] } | undefined)?.sessions || [];
    onHistoryUpdate(sessions);
  });
}

chrome.runtime.sendMessage({ type: 'GET_AUTH' }, (response) => {
  const isAuth = response?.isAuthenticated ?? false;
  if (isAuth) {
    showView('input');
    loadHistory();
  } else {
    showView('auth');
  }
});
