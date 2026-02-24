import type { CalendarEvent, IdentifiedEvent } from '../workspace/events/types'

// Context understanding types - matches backend Pydantic models

export interface UserContext {
  role: string // 'student', 'professional', 'organizer', 'attendee', etc.
  domain: string // 'academic', 'professional', 'personal', 'social', etc.
  task_type: string // 'semester_planning', 'single_event', 'coordinating_meeting', etc.
}

export interface ExtractionGuidance {
  include: string[] // Event types TO extract
  exclude: string[] // Content types to IGNORE
  reasoning: string // Why these decisions make sense
}

export interface IntentAnalysis {
  primary_goal: string // What the user wants to accomplish
  confidence: 'high' | 'medium' | 'low'
  extraction_guidance: ExtractionGuidance
  expected_event_count: string // 'single event', '5-10 events', etc.
  domain_assumptions: string // Key assumptions about this domain
}

export interface ContextResult {
  title: string // Smart session title
  user_context: UserContext
  intent_analysis: IntentAnalysis
}

// Input types - captures what the user submitted
export type InputType = 'image' | 'document' | 'text' | 'audio' | 'pdf' | 'email'

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
  status: 'active' | 'processing' | 'completed' | 'cancelled' | 'error'
  errorMessage?: string

  // Metadata for sidebar display
  title: string // Auto-generated from first event or input
  eventCount: number
}

// Session list item for sidebar
export interface SessionListItem {
  id: string
  title: string
  icon?: string
  timestamp: Date
  eventCount: number
  addedToCalendar: boolean
  status: Session['status']
  inputType: InputType // Type of data uploaded (file, text, audio)
}
