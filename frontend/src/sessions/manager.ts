import type {
  Session,
  SessionInput,
  AgentOutput,
  InputType,
  InputMetadata,
  ProcessingProgress,
  SessionListItem,
  ContextResult,
} from './types'
import type { IdentifiedEvent, CalendarEvent } from '../workspace/events/types'

// Generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Categorize file type from metadata
function categorizeFileType(metadata: InputMetadata): InputType {
  if (!metadata.fileType) return 'document'

  const fileType = metadata.fileType.toLowerCase()
  const fileName = metadata.fileName?.toLowerCase() || ''

  // Check if it's an image
  if (fileType.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/.test(fileName)) {
    return 'image'
  }

  // Check if it's audio
  if (fileType.startsWith('audio/') ||
      /\.(mp3|wav|m4a|ogg|webm)$/.test(fileName)) {
    return 'audio'
  }

  // Everything else is a document
  return 'document'
}

// Create a new session from user input
export function createSession(
  type: InputType | 'file', // Accept legacy 'file' type for backward compatibility
  content: string,
  metadata: InputMetadata
): Session {
  const sessionId = generateId()
  const inputId = generateId()
  const now = new Date()

  // Auto-detect file type if 'file' is passed (for backward compatibility)
  const actualType: InputType = (type as string) === 'file' ? categorizeFileType(metadata) : (type as InputType)

  const input: SessionInput = {
    id: inputId,
    type: actualType,
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
    // Use placeholder title - real title will be streamed from backend
    title: generatePlaceholderTitle(actualType),
    eventCount: 0,
  }
}

// Generate a placeholder title while real title is being generated
function generatePlaceholderTitle(type: InputType): string {
  switch (type) {
    case 'image':
      return 'Image Analysis'
    case 'document':
      return 'Document Processing'
    case 'audio':
      return 'Audio Transcription'
    case 'text':
      return 'New Session'
    default:
      return 'Processing...'
  }
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
  // Determine primary input type (use first input)
  const primaryInputType = session.inputs.length > 0 ? session.inputs[0].type : 'text'

  return {
    id: session.id,
    title: session.title,
    timestamp: session.createdAt,
    eventCount: session.eventCount,
    status: session.status,
    inputType: primaryInputType,
  }
}
