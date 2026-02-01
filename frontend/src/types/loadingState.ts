import type { Icon } from '@phosphor-icons/react'
import {
  FileText as FileTextIcon,
  Database as DatabaseIcon,
  Article as ArticleIcon,
  CalendarBlank as CalendarIcon,
  Sparkle as SparkleIcon,
  ListBullets as ListBulletsIcon,
  NotePencil as NotePencilIcon,
} from '@phosphor-icons/react'

export interface LoadingStateConfig {
  /** Current loading message */
  message: string
  /** Optional icon component */
  icon?: Icon
  /** Optional submessage for additional context */
  submessage?: string
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
  READING_FILE: { message: 'Reading file...', icon: FileTextIcon },
  PROCESSING_FILE: { message: 'Processing file content...', icon: DatabaseIcon },

  // Text processing
  PROCESSING_TEXT: { message: 'Processing text...', icon: ArticleIcon },

  // Context understanding
  UNDERSTANDING_CONTEXT: { message: 'Understanding context and intent...', icon: ListBulletsIcon },

  // Event extraction
  EXTRACTING_EVENTS: { message: 'Extracting calendar events...', icon: SparkleIcon },

  // Fact extraction
  EXTRACTING_FACTS: { message: 'Analyzing event details...', icon: ListBulletsIcon },

  // Calendar formatting
  FORMATTING_CALENDAR: { message: 'Formatting for calendar...', icon: NotePencilIcon },

  // Multi-event progress
  PROCESSING_EVENTS: (current: number, total: number) => ({
    message: `Processing event ${current} of ${total}...`,
    icon: CalendarIcon,
  }),
} as const
