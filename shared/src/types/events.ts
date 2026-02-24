/**
 * Calendar event types and utility functions.
 */

export interface CalendarDateTime {
  dateTime?: string;
  date?: string;
  timeZone: string;
}

/** Get the effective datetime string from a CalendarDateTime, preferring dateTime over date */
export function getEffectiveDateTime(dt: CalendarDateTime): string {
  if (dt.dateTime) return dt.dateTime;
  if (dt.date) return dt.date + 'T00:00:00';
  return '';
}

/** Check if a CalendarDateTime represents an all-day event */
export function isAllDay(dt: CalendarDateTime): boolean {
  return !dt.dateTime && !!dt.date;
}

export interface ProviderSync {
  provider: string;
  provider_event_id: string;
  calendar_id: string;
  synced_at: string;
  synced_version: number;
}

export interface CalendarEvent {
  id?: string;
  summary: string;
  start: CalendarDateTime;
  end: CalendarDateTime;
  location?: string;
  description?: string;
  recurrence?: string[] | null;
  calendar?: string;
  calendarColor?: string;
  calendarName?: string;
  version?: number;
  provider_syncs?: ProviderSync[];
}

/**
 * Derive the sync status of an event for a specific calendar provider.
 * - 'draft': never synced to this provider
 * - 'applied': synced and up to date
 * - 'edited': synced but event has been edited since
 */
export function getEventSyncStatus(
  event: CalendarEvent,
  activeProvider?: string
): 'draft' | 'applied' | 'edited' {
  if (!activeProvider || !event.provider_syncs) return 'draft';
  const sync = event.provider_syncs.find(s => s.provider === activeProvider);
  if (!sync) return 'draft';
  if (sync.synced_version === event.version) return 'applied';
  return 'edited';
}

export interface IdentifiedEvent {
  raw_text: string[];
  description: string;
  confidence: 'definite' | 'tentative';
}

export interface IdentificationResult {
  events: IdentifiedEvent[];
  num_events: number;
  has_events: boolean;
}
