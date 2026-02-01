import type { CalendarEvent, IdentifiedEvent } from './calendarEvent'
import type { ContextResult } from './context'

// Input types - captures what the user submitted
export type InputType = 'file' | 'text' | 'audio'

export interface InputMetadata {
  fileName?: string
  fileSize?: number
  fileType?: string
  textLength?: number
  audioDuration?: number
  timestamp: Date
}

export interface SessionInput {
  id: string
  type: InputType
  content: string // Text content or file name (Files can't be serialized)
  metadata: InputMetadata
  timestamp: Date
}

// Agent output tracking - one per processing step
export interface AgentOutput {
  id: string
  agentName: string // "FileProcessing", "EventIdentification", "FactExtraction_Event1", etc.
  timestamp: Date
  duration?: number // Processing time in ms
  input: any // Agent-specific input
  output: any // Agent-specific output
  success: boolean
  error?: string
}

// Processing stage tracking
export type ProcessingStage =
  | 'idle'
  | 'processing_input'
  | 'extracting_events'
  | 'extracting_facts'
  | 'formatting_calendar'
  | 'complete'
  | 'error'

export interface ProcessingProgress {
  stage: ProcessingStage
  currentEvent?: number
  totalEvents?: number
  message?: string
}

// Session state - captures everything about a processing session
export interface Session {
  id: string
  createdAt: Date
  updatedAt: Date

  // Input tracking
  inputs: SessionInput[]

  // Context understanding (from Agent 0)
  context?: ContextResult

  // Processing tracking
  progress: ProcessingProgress
  agentOutputs: AgentOutput[]

  // Results
  extractedEvents: IdentifiedEvent[]
  calendarEvents: CalendarEvent[]

  // Session status
  status: 'active' | 'completed' | 'cancelled' | 'error'
  errorMessage?: string

  // Metadata for sidebar display
  title: string // Auto-generated from first event or input
  eventCount: number
}

// Session list item for sidebar
export interface SessionListItem {
  id: string
  title: string
  timestamp: Date
  eventCount: number
  status: Session['status']
}
