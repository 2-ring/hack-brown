import type { Session } from './types'

// Backend API base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// Placeholder user ID (will be replaced with real auth later)
const TEMP_USER_ID = 'temp-user-id'

// Backend response types
interface BackendSession {
  id: string
  user_id: string
  title: string
  status: string
  created_at: string
  updated_at: string
  input_type: string
  input_content: string
  input_metadata: any
  context_result?: any
  extracted_events?: any[]
  processed_events?: any[]
  error_message?: string
}

// Convert backend session to frontend Session
function deserializeBackendSession(backendSession: BackendSession): Session {
  return {
    id: backendSession.id,
    createdAt: new Date(backendSession.created_at),
    updatedAt: new Date(backendSession.updated_at),
    inputs: [{
      id: `${backendSession.id}-input`,
      type: backendSession.input_type as any,
      content: backendSession.input_content,
      metadata: {
        ...backendSession.input_metadata,
        timestamp: new Date(backendSession.input_metadata.timestamp || backendSession.created_at)
      },
      timestamp: new Date(backendSession.created_at)
    }],
    context: backendSession.context_result,
    progress: {
      stage: backendSession.status === 'completed' ? 'complete' :
              backendSession.status === 'error' ? 'error' : 'processing_input'
    },
    agentOutputs: [], // Backend doesn't store agent outputs yet
    extractedEvents: backendSession.extracted_events || [],
    calendarEvents: backendSession.processed_events || [],
    status: backendSession.status === 'completed' ? 'completed' :
            backendSession.status === 'error' ? 'error' : 'active',
    errorMessage: backendSession.error_message,
    title: backendSession.title,
    eventCount: (backendSession.processed_events || []).length
  }
}

// Convert frontend Session to backend format
function serializeSessionForBackend(session: Session): Partial<BackendSession> {
  const primaryInput = session.inputs[0]

  return {
    id: session.id,
    user_id: TEMP_USER_ID,
    title: session.title,
    status: session.status,
    input_type: primaryInput?.type || 'text',
    input_content: primaryInput?.content || '',
    input_metadata: primaryInput?.metadata || {},
    context_result: session.context,
    extracted_events: session.extractedEvents,
    processed_events: session.calendarEvents,
    error_message: session.errorMessage
  }
}

// API Methods

/**
 * Create a new session on the backend
 */
export async function createSessionOnBackend(session: Session): Promise<Session> {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serializeSessionForBackend(session))
    })

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`)
    }

    const backendSession = await response.json()
    return deserializeBackendSession(backendSession)
  } catch (error) {
    console.error('Error creating session on backend:', error)
    throw error
  }
}

/**
 * Update an existing session on the backend
 */
export async function updateSessionOnBackend(session: Session): Promise<Session> {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${session.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serializeSessionForBackend(session))
    })

    if (!response.ok) {
      throw new Error(`Failed to update session: ${response.statusText}`)
    }

    const backendSession = await response.json()
    return deserializeBackendSession(backendSession)
  } catch (error) {
    console.error('Error updating session on backend:', error)
    throw error
  }
}

/**
 * Get a single session from the backend
 */
export async function getSessionFromBackend(sessionId: string): Promise<Session | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new Error(`Failed to get session: ${response.statusText}`)
    }

    const backendSession = await response.json()
    return deserializeBackendSession(backendSession)
  } catch (error) {
    console.error('Error getting session from backend:', error)
    return null
  }
}

/**
 * Get all sessions for the current user from the backend
 */
export async function getAllSessionsFromBackend(): Promise<Session[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions?user_id=${TEMP_USER_ID}`)

    if (!response.ok) {
      throw new Error(`Failed to get sessions: ${response.statusText}`)
    }

    const backendSessions = await response.json()
    return backendSessions.map(deserializeBackendSession)
  } catch (error) {
    console.error('Error getting sessions from backend:', error)
    // Return empty array on error so app can still function with localStorage
    return []
  }
}

/**
 * Delete a session from the backend
 */
export async function deleteSessionFromBackend(sessionId: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: 'DELETE'
    })

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete session: ${response.statusText}`)
    }
  } catch (error) {
    console.error('Error deleting session from backend:', error)
    throw error
  }
}
