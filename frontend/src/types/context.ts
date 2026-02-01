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
