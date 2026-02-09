import { useState, useCallback, useEffect, useRef } from 'react'
import { Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { validateFile } from './workspace/input/validation'
import { Workspace } from './workspace/Workspace'
import { Menu } from './menu/Menu'
import { Plans } from './payment/Plans'
import { Welcome } from './welcome/Welcome'
import { NotFound } from './NotFound'
import { Privacy } from './legal/Privacy'
import { Terms } from './legal/Terms'
import { useAuth } from './auth/AuthContext'
import { GuestSessionManager } from './auth/GuestSessionManager'
import { AuthModal } from './auth/AuthModal'
import {
  NotificationProvider,
  useNotifications,
  createValidationErrorNotification,
  createSuccessNotification,
  createWarningNotification,
  createErrorNotification
} from './workspace/input/notifications'
import type { CalendarEvent, LoadingStateConfig } from './workspace/events/types'
import { LOADING_MESSAGES } from './workspace/events/types'
import type { Session as BackendSession } from './api/types'
import {
  createTextSession,
  uploadFile as apiUploadFile,
  getUserSessions,
  getSession,
  pollSession,
  addSessionToCalendar,
  getSessionEvents,
  createGuestTextSession,
  uploadGuestFile,
  getGuestSession,
  migrateGuestSessions
} from './api/backend-client'
import { syncCalendar } from './api/sync'
import './App.css'

type AppState = 'input' | 'loading' | 'review'

// Simple session list item for menu
interface SessionListItem {
  id: string
  title: string
  timestamp: Date
  inputType: 'text' | 'image' | 'audio' | 'document'
  status: 'processing' | 'completed'
  eventCount: number
}


// Main content component that handles all the business logic
function AppContent() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { sessionId } = useParams<{ sessionId?: string }>()
  const { addNotification } = useNotifications()

  const [appState, setAppState] = useState<AppState>('input')
  const [isProcessing, setIsProcessing] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [loadingConfig, setLoadingConfig] = useState<LoadingStateConfig>(LOADING_MESSAGES.READING_FILE)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string>('')

  // Session state (from backend)
  const [currentSession, setCurrentSession] = useState<BackendSession | null>(null)
  const [sessionHistory, setSessionHistory] = useState<BackendSession[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)

  // Tracks the session the user is currently viewing (prevents stale processing from hijacking UI)
  const activeViewSessionRef = useRef<string | null>(null)

  // Guest mode state
  const [isGuestMode, setIsGuestMode] = useState(false)
  const [authModalHeading, setAuthModalHeading] = useState<string | null>(null)

  // Check guest mode on mount
  useEffect(() => {
    if (!user) {
      setIsGuestMode(true)
    } else {
      setIsGuestMode(false)
    }
  }, [user])

  // Migrate guest sessions after sign-in
  useEffect(() => {
    if (user && isGuestMode) {
      const guestSessionIds = GuestSessionManager.getSessionIds()
      if (guestSessionIds.length > 0) {
        migrateGuestSessions(guestSessionIds)
          .then(() => {
            GuestSessionManager.clearGuestSessions()
            console.log('Guest sessions migrated to user account')
            addNotification(createSuccessNotification('Your guest sessions have been saved to your account!'))
            // Refresh session history to show migrated sessions
            setIsLoadingSessions(true)
            getUserSessions()
              .then(setSessionHistory)
              .catch(console.error)
              .finally(() => setIsLoadingSessions(false))
          })
          .catch(error => {
            console.error('Failed to migrate guest sessions:', error)
          })
      }
      setIsGuestMode(false)
    }
  }, [user, isGuestMode])

  // Load session from URL on mount or when sessionId changes
  useEffect(() => {
    if (sessionId) {
      // Wait for auth to finish loading before checking access
      if (authLoading) return

      // Check if guest can access this session
      const isGuestSession = GuestSessionManager.getSessionIds().includes(sessionId)

      if (!user && !isGuestSession) {
        // Not authenticated and not their guest session
        setAuthModalHeading('Sign in to view this session.')
        navigate('/')
        return
      }

      activeViewSessionRef.current = sessionId
      setIsProcessing(true)
      setAppState('loading')
      setCalendarEvents([])
      setLoadingConfig(LOADING_MESSAGES.READING_FILE)

      // Use guest endpoint if not authenticated and is a guest session
      const fetchSession = (!user && isGuestSession)
        ? getGuestSession(sessionId)
        : getSession(sessionId)

      fetchSession
        .then(async session => {
          setCurrentSession(session)

          // Fetch events from events table (falls back to processed_events on backend)
          try {
            const events = await getSessionEvents(session.id, !user && isGuestSession)
            if (events.length > 0) {
              setCalendarEvents(events)
              setAppState('review')
            } else if (session.processed_events && session.processed_events.length > 0) {
              // Backward compat for old sessions without event_ids
              setCalendarEvents(session.processed_events as CalendarEvent[])
              setAppState('review')
            } else {
              setAppState('input')
            }
          } catch {
            // Fallback to processed_events blob if events endpoint fails
            if (session.processed_events && session.processed_events.length > 0) {
              setCalendarEvents(session.processed_events as CalendarEvent[])
              setAppState('review')
            } else {
              setAppState('input')
            }
          }
        })
        .catch(error => {
          console.error('Failed to load session:', error)

          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          if (errorMessage.includes('authentication') || errorMessage.includes('requires authentication')) {
            setAuthModalHeading('Sign in to continue.')
          } else {
            addNotification(createErrorNotification('The session could not be found.'))
          }
          navigate('/')
          setAppState('input')
        })
        .finally(() => {
          setIsProcessing(false)
        })
    }
  }, [sessionId, navigate, user, authLoading])

  // Load session history and sync calendar when user logs in
  // Use ref to avoid re-fetching when user object reference changes but ID is the same
  const lastLoadedUserId = useRef<string | null>(null)
  useEffect(() => {
    if (user && user.id !== lastLoadedUserId.current) {
      lastLoadedUserId.current = user.id
      setIsLoadingSessions(true)
      getUserSessions()
        .then(setSessionHistory)
        .catch(console.error)
        .finally(() => setIsLoadingSessions(false))

      // Sync calendar with provider (smart backend decides strategy)
      syncCalendar()
        .then(result => {
          if (result.skipped) {
            console.log(`Calendar sync skipped: ${result.reason}`)
          } else {
            console.log(
              `Calendar synced (${result.strategy}): ` +
              `+${result.events_added} ~${result.events_updated} -${result.events_deleted} ` +
              `(Total: ${result.total_events_in_db} events)`
            )
          }
        })
        .catch(error => {
          // Silent fail - don't interrupt user experience if sync fails
          console.error('Calendar sync failed:', error)
        })
    } else if (!user) {
      lastLoadedUserId.current = null
    }
  }, [user])

  // Auto-refresh session list when there are processing sessions (e.g. from a previous visit)
  useEffect(() => {
    const hasProcessingSessions = sessionHistory.some(
      s => s.status === 'pending' || s.status === 'processing'
    )
    if (!hasProcessingSessions || !user) return

    const interval = setInterval(() => {
      getUserSessions()
        .then(setSessionHistory)
        .catch(console.error)
    }, 3000)

    return () => clearInterval(interval)
  }, [sessionHistory, user])

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  // Process file upload
  const processFile = useCallback(async (file: File) => {
    if (isProcessing) {
      addNotification(createWarningNotification('Please wait for the current file to finish processing.'))
      return
    }

    // Check if guest and at limit
    if (!user && GuestSessionManager.hasReachedLimit()) {
      setAuthModalHeading("You've used all 3 free sessions. Sign in to keep going.")
      return
    }

    const validation = validateFile(file)
    if (!validation.valid) {
      addNotification(createValidationErrorNotification(validation.error || 'Invalid file'))
      return
    }

    setIsProcessing(true)
    setAppState('loading')
    setCalendarEvents([])
    setFeedbackMessage('')
    setLoadingConfig(LOADING_MESSAGES.READING_FILE)

    try {
      // Determine file type
      const fileType = file.type.startsWith('audio/') ? 'audio' : 'image'

      // Route to guest or authenticated endpoint
      const { session } = user
        ? await apiUploadFile(file, fileType)
        : await uploadGuestFile(file, fileType)

      setCurrentSession(session)
      activeViewSessionRef.current = session.id

      // Track guest session with access token
      if (!user && session.access_token) {
        GuestSessionManager.addGuestSession(session.id, session.access_token)
      }

      // Silently refresh session list so the new session appears as a skeleton
      if (user) {
        getUserSessions().then(setSessionHistory).catch(console.error)
      }

      setLoadingConfig(LOADING_MESSAGES.PROCESSING_FILE)

      // Poll for completion (use guest endpoint if not authenticated)
      const completedSession = await pollSession(
        session.id,
        (updatedSession) => {
          // Only update loading UI if user is still viewing this session
          if (activeViewSessionRef.current === session.id) {
            setCurrentSession(updatedSession)
            if (updatedSession.status === 'processing') {
              setLoadingConfig(LOADING_MESSAGES.EXTRACTING_EVENTS)
            }
          }
        },
        2000,
        !user // isGuest parameter
      )

      // Always refresh session list so sidebar updates
      if (user) {
        getUserSessions().then(setSessionHistory).catch(console.error)
      }

      // If user navigated away, don't touch UI state
      if (activeViewSessionRef.current !== session.id) {
        return
      }

      // Fetch events from events table
      const events = await getSessionEvents(completedSession.id, !user)

      if (events.length === 0) {
        // Backward compat: try processed_events blob
        if (completedSession.processed_events && completedSession.processed_events.length > 0) {
          setCalendarEvents(completedSession.processed_events as CalendarEvent[])
        } else {
          setFeedbackMessage("Hmm, we couldn't find any events in there. Try a different file!")
          setAppState('input')
          return
        }
      } else {
        setCalendarEvents(events)
      }

      setAppState('review')

      // Navigate to the session URL
      navigate(`/s/${completedSession.id}`)

    } catch (error) {
      // Only show error if user is still viewing this session
      if (activeViewSessionRef.current === null || activeViewSessionRef.current === currentSession?.id) {
        addNotification(createErrorNotification("Oops! Something went wrong. Mind trying that again?"))
        setAppState('input')
      }
      // Always refresh session list so the failed session gets filtered out
      if (user) {
        getUserSessions().then(setSessionHistory).catch(console.error)
      }
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing, navigate, user])

  // Process text input
  const processText = useCallback(async (text: string) => {
    if (isProcessing) {
      addNotification(createWarningNotification('Please wait for the current input to finish processing.'))
      return
    }

    // Check if guest and at limit
    if (!user && GuestSessionManager.hasReachedLimit()) {
      setAuthModalHeading("You've used all 3 free sessions. Sign in to keep going.")
      return
    }

    setIsProcessing(true)
    setAppState('loading')
    setCalendarEvents([])
    setFeedbackMessage('')
    setLoadingConfig(LOADING_MESSAGES.PROCESSING_TEXT)

    try {
      // Route to guest or authenticated endpoint
      const session = user
        ? await createTextSession(text)
        : await createGuestTextSession(text)

      setCurrentSession(session)
      activeViewSessionRef.current = session.id

      // Track guest session with access token
      if (!user && session.access_token) {
        GuestSessionManager.addGuestSession(session.id, session.access_token)
      }

      // Silently refresh session list so the new session appears as a skeleton
      if (user) {
        getUserSessions().then(setSessionHistory).catch(console.error)
      }

      // Poll for completion (use guest endpoint if not authenticated)
      const completedSession = await pollSession(
        session.id,
        (updatedSession) => {
          // Only update loading UI if user is still viewing this session
          if (activeViewSessionRef.current === session.id) {
            setCurrentSession(updatedSession)
            if (updatedSession.status === 'processing') {
              setLoadingConfig(LOADING_MESSAGES.EXTRACTING_EVENTS)
            }
          }
        },
        2000,
        !user // isGuest parameter
      )

      // Always refresh session list so sidebar updates
      if (user) {
        getUserSessions().then(setSessionHistory).catch(console.error)
      }

      // If user navigated away, don't touch UI state
      if (activeViewSessionRef.current !== session.id) {
        return
      }

      // Fetch events from events table
      const events = await getSessionEvents(completedSession.id, !user)

      if (events.length === 0) {
        // Backward compat: try processed_events blob
        if (completedSession.processed_events && completedSession.processed_events.length > 0) {
          setCalendarEvents(completedSession.processed_events as CalendarEvent[])
        } else {
          setFeedbackMessage("The text doesn't appear to contain any calendar events.")
          setAppState('input')
          return
        }
      } else {
        setCalendarEvents(events)
      }

      setAppState('review')

      // Navigate to the session URL
      navigate(`/s/${completedSession.id}`)

    } catch (error) {
      // Only show error if user is still viewing this session
      if (activeViewSessionRef.current === null || activeViewSessionRef.current === currentSession?.id) {
        addNotification(createErrorNotification("Oops! Something went wrong. Mind trying that again?"))
        setAppState('input')
      }
      // Always refresh session list so the failed session gets filtered out
      if (user) {
        getUserSessions().then(setSessionHistory).catch(console.error)
      }
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing, navigate, user])

  // Handle file upload
  const handleFileUpload = useCallback((file: File) => {
    processFile(file)
  }, [processFile])

  // Handle audio submission
  const handleAudioSubmit = useCallback((audioBlob: Blob) => {
    const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' })

    if (audioBlob.size < 1000) {
      addNotification(createErrorNotification('Please record for at least a few seconds.'))
      return
    }

    processFile(audioFile)
  }, [processFile])

  // Handle text submission
  const handleTextSubmit = useCallback((text: string) => {
    processText(text)
  }, [processText])

  // Handle clearing file
  const handleClearFile = useCallback(() => {
    setCalendarEvents([])
    setAppState('input')
  }, [])

  // Handle session click (load from history)
  const handleSessionClick = useCallback((sessionId: string) => {
    activeViewSessionRef.current = sessionId
    navigate(`/s/${sessionId}`)
    setSidebarOpen(false)
  }, [navigate])

  // Handle new session
  const handleNewSession = useCallback(() => {
    activeViewSessionRef.current = null
    setAppState('input')
    setCurrentSession(null)
    setCalendarEvents([])
    setIsProcessing(false)
    navigate('/')
    setSidebarOpen(false)
  }, [navigate])

  // Handle adding events to Google Calendar
  // Returns result for EventsWorkspace to show notifications; throws on error
  const handleAddToCalendar = useCallback(async (editedEvents?: CalendarEvent[]) => {
    // Require auth for calendar operations
    if (!user) {
      setAuthModalHeading('Sign in to add events to your calendar.')
      return
    }

    if (!currentSession) {
      throw new Error('No session available to add to calendar.')
    }

    try {
      // Pass edited events for correction logging
      const result = await addSessionToCalendar(currentSession.id, editedEvents)

      // Reload the session to get updated calendar_event_ids
      const updatedSession = await getSession(currentSession.id)
      setCurrentSession(updatedSession)

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('not connected') || errorMessage.includes('not authenticated') || errorMessage.includes('401')) {
        // Calendar tokens missing or expired. From the user's perspective this
        // is the same as not being signed in — show the sign-in prompt which
        // re-triggers the Google OAuth flow (with calendar scopes) to fix it.
        setAuthModalHeading('Sign in to add events to your calendar.')
        return
      }
      throw error
    }
  }, [user, currentSession])

  // Convert backend sessions to menu format (filter out error sessions)
  const menuSessions: SessionListItem[] = sessionHistory
    .filter(session => session.status !== 'error')
    .map(session => ({
      id: session.id,
      title: session.title || session.input_content.substring(0, 50) + (session.input_content.length > 50 ? '...' : ''),
      timestamp: new Date(session.created_at),
      inputType: session.input_type as 'text' | 'image' | 'audio',
      status: session.status === 'processed' ? 'completed' as const : 'processing' as const,
      eventCount: session.event_ids?.length || session.processed_events?.length || 0,
    }))

  return (
    <div className="app">
      <AuthModal
        isOpen={authModalHeading !== null}
        onClose={() => setAuthModalHeading(null)}
        heading={authModalHeading ?? undefined}
      />
      <Menu
        isOpen={sidebarOpen}
        onToggle={handleSidebarToggle}
        sessions={menuSessions}
        currentSessionId={currentSession?.id}
        onSessionClick={handleSessionClick}
        onNewSession={handleNewSession}
        isLoadingSessions={isLoadingSessions}
      />
      <div className={`content ${sidebarOpen ? 'with-sidebar' : ''} ${appState === 'loading' || appState === 'review' ? 'events-view' : ''}`}>
        <Workspace
          appState={appState}
          uploadedFile={null}
          isProcessing={isProcessing}
          loadingConfig={[loadingConfig]}
          feedbackMessage={feedbackMessage}
          isGuestMode={isGuestMode}
          calendarEvents={calendarEvents}
          expectedEventCount={calendarEvents.length}
          inputType={currentSession?.input_type}
          inputContent={currentSession?.input_content}
          onFileUpload={handleFileUpload}
          onAudioSubmit={handleAudioSubmit}
          onTextSubmit={handleTextSubmit}
          onClearFile={handleClearFile}
          onConfirm={handleAddToCalendar}
          onMenuToggle={handleSidebarToggle}
          onNewSession={handleNewSession}
          sessionId={currentSession?.id}
        />
      </div>
    </div>
  )
}

// Router wrapper component
function App() {
  return (
    <NotificationProvider>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/s/:sessionId" element={<AppContent />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </NotificationProvider>
  )
}

export default App
