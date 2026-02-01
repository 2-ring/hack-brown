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
