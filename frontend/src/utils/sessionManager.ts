import type {
  Session,
  SessionInput,
  AgentOutput,
  InputType,
  InputMetadata,
  ProcessingProgress,
  SessionListItem,
} from '../types/session'
import type { IdentifiedEvent, CalendarEvent } from '../types/calendarEvent'
import type { ContextResult } from '../types/context'

// Generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Create a new session from user input
export function createSession(
  type: InputType,
  content: string,
  metadata: InputMetadata
): Session {
  const sessionId = generateId()
  const inputId = generateId()
  const now = new Date()

  const input: SessionInput = {
    id: inputId,
    type,
    content,
    metadata,
    timestamp: now,
  }

  return {
    id: sessionId,
    createdAt: now,
    updatedAt: now,
    inputs: [input],
    progress: {
      stage: 'processing_input',
    },
    agentOutputs: [],
    extractedEvents: [],
    calendarEvents: [],
    status: 'active',
    title: generateSessionTitle(content, type),
    eventCount: 0,
  }
}

// Generate a readable title from input
function generateSessionTitle(content: string, type: InputType): string {
  if (type === 'file') {
    return content // File name
  }

  // For text/audio, use first 50 chars
  const truncated = content.substring(0, 50).trim()
  return truncated.length < content.length ? `${truncated}...` : truncated
}

// Update session with agent output
export function addAgentOutput(
  session: Session,
  agentName: string,
  input: any,
  output: any,
  success: boolean,
  duration?: number,
  error?: string
): Session {
  const now = new Date()

  const agentOutput: AgentOutput = {
    id: generateId(),
    agentName,
    timestamp: now,
    duration,
    input,
    output,
    success,
    error,
  }

  return {
    ...session,
    updatedAt: now,
    agentOutputs: [...session.agentOutputs, agentOutput],
  }
}

// Update session with context understanding
export function setContext(
  session: Session,
  context: ContextResult
): Session {
  return {
    ...session,
    updatedAt: new Date(),
    context,
    title: context.title,
  }
}

// Update session progress
export function updateProgress(
  session: Session,
  progress: Partial<ProcessingProgress>
): Session {
  return {
    ...session,
    updatedAt: new Date(),
    progress: { ...session.progress, ...progress },
  }
}

// Update extracted events
export function setExtractedEvents(
  session: Session,
  events: IdentifiedEvent[]
): Session {
  const eventCount = events.length

  return {
    ...session,
    updatedAt: new Date(),
    extractedEvents: events,
    eventCount,
    title:
      events.length > 0
        ? events[0].description.substring(0, 50)
        : session.title,
  }
}

// Update formatted calendar events
export function setCalendarEvents(
  session: Session,
  events: CalendarEvent[]
): Session {
  return {
    ...session,
    updatedAt: new Date(),
    calendarEvents: events,
    eventCount: events.length,
  }
}

// Mark session as complete or error
export function completeSession(
  session: Session,
  status: 'completed' | 'cancelled' | 'error',
  errorMessage?: string
): Session {
  return {
    ...session,
    updatedAt: new Date(),
    status,
    errorMessage,
    progress: {
      ...session.progress,
      stage: status === 'completed' ? 'complete' : 'error',
    },
  }
}

// Convert session to list item for sidebar
export function toSessionListItem(session: Session): SessionListItem {
  return {
    id: session.id,
    title: session.title,
    timestamp: session.createdAt,
    eventCount: session.eventCount,
    status: session.status,
  }
}

// Session storage (in-memory cache)
class SessionCache {
  private sessions: Map<string, Session> = new Map()
  private maxSessions = 50 // Keep last 50 sessions

  save(session: Session): void {
    this.sessions.set(session.id, session)
    this.pruneOldSessions()
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )
  }

  delete(id: string): void {
    this.sessions.delete(id)
  }

  private pruneOldSessions(): void {
    if (this.sessions.size > this.maxSessions) {
      const sorted = this.getAll()
      const toDelete = sorted.slice(this.maxSessions)
      toDelete.forEach((s) => this.sessions.delete(s.id))
    }
  }

  clear(): void {
    this.sessions.clear()
  }
}

export const sessionCache = new SessionCache()
