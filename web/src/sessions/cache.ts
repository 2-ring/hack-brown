import type { Session } from './types'

// LocalStorage key for session persistence
const STORAGE_KEY = 'dropcal_sessions'

// Serialize session for storage (handles Date objects)
function serializeSession(session: Session): any {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    inputs: session.inputs.map(input => ({
      ...input,
      timestamp: input.timestamp.toISOString(),
      metadata: {
        ...input.metadata,
        timestamp: input.metadata.timestamp.toISOString(),
      },
    })),
    agentOutputs: session.agentOutputs.map(output => ({
      ...output,
      timestamp: output.timestamp.toISOString(),
    })),
  }
}

// Deserialize session from storage (converts ISO strings back to Dates)
function deserializeSession(data: any): Session {
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
    inputs: data.inputs.map((input: any) => ({
      ...input,
      timestamp: new Date(input.timestamp),
      metadata: {
        ...input.metadata,
        timestamp: new Date(input.metadata.timestamp),
      },
    })),
    agentOutputs: data.agentOutputs.map((output: any) => ({
      ...output,
      timestamp: new Date(output.timestamp),
    })),
  }
}

// Session storage (in-memory cache with observer pattern + localStorage persistence)
export type SessionCacheListener = () => void

export class SessionCache {
  private sessions: Map<string, Session> = new Map()
  private maxSessions = 50 // Keep last 50 sessions
  private listeners: Set<SessionCacheListener> = new Set()

  constructor() {
    this.loadFromStorage()
  }

  // Load sessions from localStorage
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const serializedSessions = JSON.parse(stored)
        serializedSessions.forEach((data: any) => {
          const session = deserializeSession(data)
          this.sessions.set(session.id, session)
        })
      }
    } catch (error) {
      console.error('Failed to load sessions from localStorage:', error)
      // Clear corrupted data
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  // Save sessions to localStorage
  private saveToStorage(): void {
    try {
      const sessions = this.getAll()
      const serialized = sessions.map(serializeSession)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized))
    } catch (error) {
      console.error('Failed to save sessions to localStorage:', error)
      // Handle quota exceeded or other errors
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        // Clear old sessions and try again
        this.pruneOldSessions(true)
        try {
          const sessions = this.getAll()
          const serialized = sessions.map(serializeSession)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized))
        } catch {
          console.error('Still failed after pruning - localStorage may be full')
        }
      }
    }
  }

  // Subscribe to cache changes
  subscribe(listener: SessionCacheListener): () => void {
    this.listeners.add(listener)
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }

  // Notify all subscribers of changes
  private notify(): void {
    this.listeners.forEach(listener => listener())
  }

  save(session: Session): void {
    // 1. Save to in-memory cache immediately (fast UI updates)
    this.sessions.set(session.id, session)
    this.pruneOldSessions()

    // 2. Save to localStorage as backup
    this.saveToStorage()

    // 3. Notify subscribers of change (UI updates immediately)
    this.notify()
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
    // 1. Delete from in-memory cache immediately
    this.sessions.delete(id)

    // 2. Save to localStorage
    this.saveToStorage()

    // 3. Notify subscribers of change (UI updates immediately)
    this.notify()
  }

  private pruneOldSessions(aggressive = false): void {
    const limit = aggressive ? Math.floor(this.maxSessions / 2) : this.maxSessions
    if (this.sessions.size > limit) {
      const sorted = this.getAll()
      const toDelete = sorted.slice(limit)
      toDelete.forEach((s) => this.sessions.delete(s.id))
      // No need to notify here since save() already does
    }
  }

  clear(): void {
    this.sessions.clear()

    // 2. Clear localStorage
    localStorage.removeItem(STORAGE_KEY)

    // 3. Notify subscribers of change (UI updates immediately)
    this.notify()
  }
}

export const sessionCache = new SessionCache()
