import type { Icon } from '@phosphor-icons/react'
import {
  BookOpenText,
  Files,
  ClipboardText,
  GraduationCap,
  Binoculars,
  Info,
  PaintBrush,
  Calendar,
  CalendarCheck,
  Pen,
} from '@phosphor-icons/react'

// Calendar event types

export interface CalendarDateTime {
  dateTime?: string
  date?: string
  timeZone: string
}

/** Get the effective datetime string from a CalendarDateTime, preferring dateTime over date */
export function getEffectiveDateTime(dt: CalendarDateTime): string {
  if (dt.dateTime) return dt.dateTime
  if (dt.date) return dt.date + 'T00:00:00'
  return ''
}

/** Check if a CalendarDateTime represents an all-day event */
export function isAllDay(dt: CalendarDateTime): boolean {
  return !dt.dateTime && !!dt.date
}

export interface ProviderSync {
  provider: string
  provider_event_id: string
  calendar_id: string
  synced_at: string
  synced_version: number
}

export interface CalendarEvent {
  id?: string
  summary: string
  start: CalendarDateTime
  end: CalendarDateTime
  location?: string
  description?: string
  recurrence?: string[] | null
  calendar?: string
  calendarColor?: string
  calendarName?: string
  version?: number
  provider_syncs?: ProviderSync[]
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
  if (!activeProvider || !event.provider_syncs) return 'draft'
  const sync = event.provider_syncs.find(s => s.provider === activeProvider)
  if (!sync) return 'draft'
  if (sync.synced_version === event.version) return 'applied'
  return 'edited'
}

export interface IdentifiedEvent {
  raw_text: string[]
  description: string
  confidence: 'definite' | 'tentative'
}

export interface IdentificationResult {
  events: IdentifiedEvent[]
  num_events: number
  has_events: boolean
}

// Loading state types

export interface LoadingStateConfig {
  /** Current loading message */
  message: string
  /** Optional icon component */
  icon?: Icon
  /** Optional submessage for additional context */
  submessage?: string
  /** Optional count display (e.g., "1/3") shown right-aligned */
  count?: string
  /** Animation speed in milliseconds (default: 500) */
  animationSpeed?: number
}

export interface LoadingPhase {
  /** The main message to display */
  message: string
  /** Optional icon component */
  icon?: Icon
  /** Optional submessage */
  submessage?: string
  /** Delay before showing this phase (ms) */
  delay?: number
}

// Single-message loading states that reflect actual API calls
export const LOADING_MESSAGES = {
  // File processing
  READING_FILE: { message: 'Reading file...', icon: BookOpenText },
  PROCESSING_FILE: { message: 'Processing file content...', icon: Files },

  // Text processing
  PROCESSING_TEXT: { message: 'Processing text...', icon: ClipboardText },

  // Context understanding
  UNDERSTANDING_CONTEXT: { message: 'Understanding context and intent...', icon: GraduationCap },

  // Event extraction
  EXTRACTING_EVENTS: { message: 'Extracting calendar events...', icon: Binoculars },

  // Fact extraction
  EXTRACTING_FACTS: { message: 'Analyzing event details...', icon: Info },

  // Calendar formatting
  FORMATTING_CALENDAR: { message: 'Formatting for calendar...', icon: PaintBrush },

  // Multi-event progress
  PROCESSING_EVENTS: (current: number, total: number) => ({
    message: `Processing event ${current} of ${total}...`,
    icon: Calendar,
  }),

  // Syncing to calendar
  ADDING_TO_CALENDAR: { message: 'Syncing to calendar...', icon: CalendarCheck },

  // AI edit processing
  APPLYING_EDITS: { message: 'Applying changes...', icon: Pen },
} as const
