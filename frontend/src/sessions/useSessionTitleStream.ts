/**
 * Hook for streaming session title updates via Server-Sent Events (SSE)
 *
 * Connects to the backend SSE endpoint and receives real-time updates
 * as the session title is generated in the background.
 *
 * @example
 * const { title, isLoading, error } = useSessionTitleStream(sessionId)
 */

import { useState, useEffect, useRef } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export interface TitleStreamState {
  /** Current title (null if not yet generated) */
  title: string | null
  /** Whether the title is still being generated */
  isLoading: boolean
  /** Error message if stream failed */
  error: string | null
  /** Session status */
  status: 'pending' | 'processing' | 'processed' | 'error'
}

export function useSessionTitleStream(
  sessionId: string | null,
  onTitleUpdate?: (title: string) => void
): TitleStreamState {
  const [title, setTitle] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'pending' | 'processing' | 'processed' | 'error'>('pending')

  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // Don't connect if no session ID
    if (!sessionId) {
      return
    }

    // Don't reconnect if already complete or error
    if (status === 'processed' || status === 'error') {
      return
    }

    setIsLoading(true)
    setError(null)

    // Create EventSource connection
    const eventSource = new EventSource(`${API_BASE_URL}/api/sessions/${sessionId}/stream`)
    eventSourceRef.current = eventSource

    // Handle initialization
    eventSource.addEventListener('init', (e) => {
      const data = JSON.parse(e.data)
      if (data.title) {
        setTitle(data.title)
        setIsLoading(false)
        if (onTitleUpdate) {
          onTitleUpdate(data.title)
        }
      }
      if (data.status) {
        setStatus(data.status)
      }
    })

    // Handle title updates
    eventSource.addEventListener('title', (e) => {
      const data = JSON.parse(e.data)
      console.log('✨ Title received:', data.title)
      setTitle(data.title)
      setIsLoading(false)
      if (onTitleUpdate) {
        onTitleUpdate(data.title)
      }
    })

    // Handle status updates
    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data)
      console.log('📊 Status update:', data.status)
      setStatus(data.status)
    })

    // Handle completion
    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data)
      console.log('✅ Session complete:', data)
      setIsLoading(false)
      setStatus(data.status)
      eventSource.close()
    })

    // Handle timeout
    eventSource.addEventListener('timeout', () => {
      console.log('⏱️  Stream timeout')
      setIsLoading(false)
      eventSource.close()
    })

    // Handle errors
    eventSource.onerror = (err) => {
      console.error('❌ SSE error:', err)
      setError('Failed to connect to title stream')
      setIsLoading(false)
      eventSource.close()
    }

    // Cleanup on unmount or session ID change
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [sessionId, status, onTitleUpdate])

  return {
    title,
    isLoading,
    error,
    status
  }
}
