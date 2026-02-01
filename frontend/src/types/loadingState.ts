import type { Icon } from '@phosphor-icons/react'
import {
  FileText as FileTextIcon,
  MagnifyingGlass as MagnifyingGlassIcon,
  Database as DatabaseIcon,
  Article as ArticleIcon,
  CalendarBlank as CalendarIcon,
  CheckCircle as CheckCircleIcon,
  Sparkle as SparkleIcon,
  Clock as ClockIcon,
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

export const LOADING_PHASES = {
  FILE_PROCESSING: [
    { message: 'Reading file...', icon: FileTextIcon, delay: 0 },
    { message: 'Analyzing content...', icon: MagnifyingGlassIcon, delay: 1500 },
    { message: 'Extracting information...', icon: DatabaseIcon, delay: 3000 },
  ],
  TEXT_PROCESSING: [
    { message: 'Processing text...', icon: ArticleIcon, delay: 0 },
    { message: 'Analyzing calendar information...', icon: CalendarIcon, delay: 1500 },
    { message: 'Extracting events...', icon: SparkleIcon, delay: 3000 },
  ],
  EXTRACTING: [
    { message: 'Finding events...', icon: MagnifyingGlassIcon, delay: 0 },
    { message: 'Parsing dates and times...', icon: ClockIcon, delay: 1500 },
    { message: 'Validating event details...', icon: CheckCircleIcon, delay: 3000 },
  ],
} as const
