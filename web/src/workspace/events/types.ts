// Re-export shared event types
export type {
  CalendarDateTime,
  CalendarEvent,
  ProviderSync,
  IdentifiedEvent,
  IdentificationResult,
} from '@dropcal/shared'
export { getEffectiveDateTime, isAllDay, getEventSyncStatus } from '@dropcal/shared'

// Local types that depend on @phosphor-icons/react
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
