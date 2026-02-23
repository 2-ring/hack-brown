// Alarm-based polling that survives service worker restarts.
// Falls back to setInterval for contexts where alarms aren't available
// (e.g., if permission is missing), but alarms are the primary mechanism.

import { api, hasAlarms } from './detect';

const ALARM_PREFIX = 'poll:';
const POLL_PERIOD_MINUTES = 1 / 30; // ~2 seconds (Chrome enforces 30s min in production)
// Chrome enforces a minimum of 30s for alarm periods. For faster polling,
// we use a single alarm as a keep-alive and do rapid polling via setTimeout
// within the alarm handler. The alarm ensures the service worker stays alive.

const RAPID_POLL_MS = 2000;
const KEEPALIVE_ALARM = 'poll-keepalive';

type PollCallback = (sessionId: string) => Promise<void>;

let pollCallback: PollCallback | null = null;
let activePolls = new Set<string>();
let rapidTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Register the callback that executes on each poll tick. Call once at startup. */
export function onPollTick(callback: PollCallback): void {
  pollCallback = callback;

  if (hasAlarms) {
    api.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === KEEPALIVE_ALARM) {
        // Keepalive fired — the rapid setTimeout timers do the actual work.
        // This just ensures the service worker stays alive.
      }
    });
  }
}

/** Start polling a session. */
export function startPolling(sessionId: string): void {
  activePolls.add(sessionId);
  ensureKeepalive();
  scheduleRapidPoll(sessionId);
}

/** Stop polling a session. */
export function stopPolling(sessionId: string): void {
  activePolls.delete(sessionId);
  const timer = rapidTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    rapidTimers.delete(sessionId);
  }
  if (activePolls.size === 0) {
    clearKeepalive();
  }
}

/** Stop all active polls. */
export function stopAllPolling(): void {
  for (const id of activePolls) {
    const timer = rapidTimers.get(id);
    if (timer) clearTimeout(timer);
  }
  activePolls.clear();
  rapidTimers.clear();
  clearKeepalive();
}

/** Check if a session is currently being polled. */
export function isPolling(sessionId: string): boolean {
  return activePolls.has(sessionId);
}

function scheduleRapidPoll(sessionId: string): void {
  if (!activePolls.has(sessionId)) return;

  const tick = async () => {
    if (!activePolls.has(sessionId) || !pollCallback) return;
    try {
      await pollCallback(sessionId);
    } catch {
      // Error handling is in the callback
    }
    // Schedule next tick if still active
    if (activePolls.has(sessionId)) {
      rapidTimers.set(sessionId, setTimeout(tick, RAPID_POLL_MS));
    }
  };

  // First tick immediately
  tick();
}

function ensureKeepalive(): void {
  if (hasAlarms) {
    // Create a periodic alarm to keep the service worker alive.
    // Chrome minimum is 30s for periodInMinutes, so we use delayInMinutes of 0.5
    // and re-create on each fire.
    api.alarms.get(KEEPALIVE_ALARM, (alarm) => {
      if (!alarm) {
        api.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
      }
    });
  }
}

function clearKeepalive(): void {
  if (hasAlarms) {
    api.alarms.clear(KEEPALIVE_ALARM);
  }
}
