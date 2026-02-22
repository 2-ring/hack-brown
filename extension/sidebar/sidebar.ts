import type { SessionRecord, CalendarEvent } from '../types';
import { initTheme } from '../theme';

const DROPCAL_URL = 'https://dropcal.ai';

// ===== DOM Elements =====

const sidebarTitle = document.getElementById('sidebar-title')!;
const stateLoading = document.getElementById('state-loading')!;
const stateEvents = document.getElementById('state-events')!;
const stateError = document.getElementById('state-error')!;
const stateEmpty = document.getElementById('state-empty')!;
const skeletonList = document.getElementById('skeleton-list')!;
const eventsList = document.getElementById('events-list')!;
const errorMessage = document.getElementById('sidebar-error-message')!;
const btnBack = document.getElementById('btn-back')!;
const btnOpenDropcal = document.getElementById('btn-open-dropcal')!;

let currentSessionId: string | null = null;

// ===== State Display =====

function showState(state: 'loading' | 'events' | 'error' | 'empty'): void {
  stateLoading.classList.toggle('hidden', state !== 'loading');
  stateEvents.classList.toggle('hidden', state !== 'events');
  stateError.classList.toggle('hidden', state !== 'error');
  stateEmpty.classList.toggle('hidden', state !== 'empty');
}

// ===== Skeleton Rendering =====

function renderSkeletons(count: number): void {
  skeletonList.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-card';
    skeleton.style.opacity = String(1 - i * 0.15);
    skeletonList.appendChild(skeleton);
  }
}

// ===== Event Rendering =====

function formatTime(dateTimeStr: string): string {
  const date = new Date(dateTimeStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatTimeRange(start: CalendarEvent['start'], end: CalendarEvent['end']): string {
  if (start.date) {
    return 'All day';
  }
  if (start.dateTime && end.dateTime) {
    return `${formatTime(start.dateTime)} - ${formatTime(end.dateTime)}`;
  }
  return '';
}

function getEventDate(event: CalendarEvent): Date {
  const str = event.start.dateTime || event.start.date || '';
  return new Date(str);
}

function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();

  const sorted = [...events].sort((a, b) => getEventDate(a).getTime() - getEventDate(b).getTime());

  for (const event of sorted) {
    const date = getEventDate(event);
    const key = date.toDateString();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(event);
  }

  return groups;
}

// Phosphor icon HTML (font-based)
const MAP_PIN_ICON = `<i class="ph-bold ph-map-pin" style="font-size: 16px"></i>`;
const EQUALS_ICON = `<i class="ph-bold ph-equals" style="font-size: 16px"></i>`;

function renderEvents(events: CalendarEvent[]): void {
  eventsList.innerHTML = '';

  if (events.length === 0) {
    showState('empty');
    return;
  }

  const groups = groupEventsByDate(events);
  let lastMonth = '';

  groups.forEach((dateEvents, dateKey) => {
    const date = new Date(dateKey);

    // Month header
    const monthYear = date.toLocaleDateString('en-US', {
      month: 'long',
      ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
    });

    if (monthYear !== lastMonth) {
      lastMonth = monthYear;
      const monthHeader = document.createElement('div');
      monthHeader.className = 'month-header';
      monthHeader.innerHTML = `<h2 class="month-header-text">${monthYear}</h2>`;
      eventsList.appendChild(monthHeader);
    }

    // Date group
    const dateGroup = document.createElement('div');
    dateGroup.className = 'date-group';

    // Date header (left column)
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateNumber = date.getDate();

    const dateHeader = document.createElement('div');
    dateHeader.className = `date-header${isToday ? ' today' : ''}`;
    dateHeader.innerHTML = `
      <div class="date-day-label">${dayOfWeek}</div>
      <div class="date-circle">
        <span class="date-number">${dateNumber}</span>
      </div>
    `;

    // Events (right column)
    const dateEventsDiv = document.createElement('div');
    dateEventsDiv.className = 'date-events';

    for (const event of dateEvents) {
      const card = document.createElement('div');
      card.className = 'event-card';

      const calendarColor = event.calendarColor || '#1170C5';
      card.style.borderLeftColor = calendarColor;
      card.style.backgroundColor = `${calendarColor}12`;

      const timeRange = formatTimeRange(event.start, event.end);

      let html = `
        <div class="event-card-title-row">
          <span class="event-card-title">${escapeHtml(event.summary)}</span>
          <span class="event-card-time">(${timeRange})</span>
        </div>
      `;

      if (event.location) {
        html += `
          <div class="event-card-meta">
            ${MAP_PIN_ICON}
            <span>${escapeHtml(event.location)}</span>
          </div>
        `;
      }

      if (event.description) {
        html += `
          <div class="event-card-meta event-card-description">
            ${EQUALS_ICON}
            <span>${escapeHtml(event.description)}</span>
          </div>
        `;
      }

      if (event.calendarName) {
        html += `
          <div class="event-calendar-badge">
            <span class="calendar-badge-dot" style="background-color: ${calendarColor}"></span>
            <span class="calendar-badge-text">${escapeHtml(event.calendarName)}</span>
          </div>
        `;
      }

      card.innerHTML = html;

      // Click → open session on dropcal.ai
      card.addEventListener('click', () => {
        if (currentSessionId) {
          chrome.runtime.sendMessage({
            type: 'OPEN_SESSION',
            sessionId: currentSessionId,
          });
        }
      });

      dateEventsDiv.appendChild(card);
    }

    dateGroup.appendChild(dateHeader);
    dateGroup.appendChild(dateEventsDiv);
    eventsList.appendChild(dateGroup);
  });

  showState('events');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Load Session =====

function loadSession(sessionId: string): void {
  currentSessionId = sessionId;

  // Show loading skeletons
  renderSkeletons(3);
  showState('loading');

  // Find session in history
  chrome.storage.local.get('sessionHistory', (result) => {
    const history = result.sessionHistory as { sessions: SessionRecord[] } | undefined;
    const session = history?.sessions.find((s) => s.sessionId === sessionId);

    if (!session) {
      errorMessage.textContent = 'Session not found.';
      showState('error');
      return;
    }

    sidebarTitle.textContent = session.title || 'Events';

    if (session.status === 'error') {
      errorMessage.textContent = session.errorMessage || 'Processing failed.';
      showState('error');
      return;
    }

    if (session.status === 'polling') {
      // Still processing — show skeletons, wait for updates
      renderSkeletons(3);
      showState('loading');
      return;
    }

    if (session.events && session.events.length > 0) {
      renderEvents(session.events);
    } else {
      showState('empty');
    }
  });
}

// ===== Buttons =====

btnBack.addEventListener('click', () => {
  window.close();
});

btnOpenDropcal.addEventListener('click', () => {
  if (currentSessionId) {
    chrome.runtime.sendMessage({
      type: 'OPEN_SESSION',
      sessionId: currentSessionId,
    });
  }
});

// ===== Live Updates =====

chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.sessionHistory && currentSessionId) {
    const history = changes.sessionHistory.newValue as { sessions: SessionRecord[] } | undefined;
    const session = history?.sessions.find((s) => s.sessionId === currentSessionId);

    if (session) {
      sidebarTitle.textContent = session.title || 'Events';

      if (session.status === 'processed' && session.events && session.events.length > 0) {
        renderEvents(session.events);
      } else if (session.status === 'error') {
        errorMessage.textContent = session.errorMessage || 'Processing failed.';
        showState('error');
      }
    }
  }
});

// ===== Init =====

// Apply theme
initTheme();

// Read which session to display from session storage
chrome.storage.session.get('sidebarSessionId', (result) => {
  const sessionId = result.sidebarSessionId as string | undefined;
  if (sessionId) {
    loadSession(sessionId);
  } else {
    showState('empty');
  }
});

// Also listen for session changes (if popup opens a different session)
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.sidebarSessionId) {
    const newSessionId = changes.sidebarSessionId.newValue as string | undefined;
    if (newSessionId && newSessionId !== currentSessionId) {
      loadSession(newSessionId);
    }
  }
});
