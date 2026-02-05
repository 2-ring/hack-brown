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
} from '@phosphor-icons/react'

// Calendar event types

export interface CalendarDateTime {
  dateTime: string
  timeZone: string
}

export interface CalendarEvent {
  summary: string
  start: CalendarDateTime
  end: CalendarDateTime
  location?: string
  description?: string
  recurrence?: string[]
  attendees?: string[]
  calendar?: string
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
} as const
