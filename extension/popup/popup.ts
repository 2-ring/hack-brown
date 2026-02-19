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

function renderHistory(sessions: SessionRecord[]): void {
  const displaySessions = sessions.filter((s) => s.status !== 'polling');
  const hasPolling = sessions.some((s) => s.status === 'polling');

  // Active processing indicator
  activeProcessingEl.classList.toggle('hidden', !hasPolling);

  if (displaySessions.length === 0) {
    resultsSection.classList.add('hidden');
    return;
  }

  resultsSection.classList.remove('hidden');
  resultsList.innerHTML = '';

  for (const session of displaySessions) {
    const row = document.createElement('div');
    row.className = 'session-row';
    row.addEventListener('click', () => openSidebar(session.sessionId));

    const dot = document.createElement('div');
    dot.className = `session-dot status-${session.status}`;

    const info = document.createElement('div');
    info.className = 'session-info';

    const title = document.createElement('div');
    title.className = 'session-row-title';
    title.textContent = session.title || 'Untitled';

    const subtitle = document.createElement('div');
    subtitle.className = 'session-row-subtitle';
    subtitle.textContent =
      session.eventSummaries.length > 0
        ? session.eventSummaries.slice(0, 3).join(' \u00B7 ')
        : session.status === 'error'
          ? session.errorMessage || 'Error'
          : '';

    info.appendChild(title);
    if (subtitle.textContent) info.appendChild(subtitle);

    const right = document.createElement('div');
    right.className = 'session-row-right';

    if (session.eventCount > 0) {
      const count = document.createElement('span');
      count.className = 'session-event-count';
      count.textContent = String(session.eventCount);
      right.appendChild(count);
    }

    const chevron = document.createElement('span');
    chevron.className = 'session-chevron';
    chevron.textContent = '\u203A';
    right.appendChild(chevron);

    row.appendChild(dot);
    row.appendChild(info);
    row.appendChild(right);
    resultsList.appendChild(row);
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
