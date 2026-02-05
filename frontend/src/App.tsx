import { useState, useCallback, useEffect } from 'react'
import { Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { validateFile } from './workspace/input/validation'
import { Workspace } from './workspace/Workspace'
import { Menu } from './menu/Menu'
import { Plans } from './payment/Plans'
import { Welcome } from './welcome/Welcome'
import { NotFound } from './NotFound'
import { useAuth } from './auth/AuthContext'
import { GuestSessionManager } from './auth/GuestSessionManager'
import { AuthModal } from './auth/AuthModal'
import {
  NotificationProvider,
  useNotifications,
  createValidationErrorNotification,
  createSuccessNotification,
  createErrorNotification,
  createWarningNotification
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
  createGuestTextSession,
  uploadGuestFile,
  getGuestSession,
  migrateGuestSessions
} from './api/backend-client'
import { syncCalendar } from './api/sync'
import './App.css'

// Import all greeting images dynamically
const greetingImages = import.meta.glob('./assets/greetings/*.{png,jpg,jpeg,svg}', { eager: true, as: 'url' })
const greetingImagePaths = Object.values(greetingImages) as string[]

type AppState = 'input' | 'loading' | 'review'

// Simple session list item for menu
interface SessionListItem {
  id: string
  title: string
  timestamp: Date
  inputType: 'text' | 'image' | 'audio' | 'document'
  status: 'active' | 'completed' | 'error'
  eventCount: number
}


// Main content component that handles all the business logic
function AppContent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { sessionId } = useParams<{ sessionId?: string }>()
  const { addNotification } = useNotifications()

  const [currentGreetingIndex] = useState(() =>
    Math.floor(Math.random() * greetingImagePaths.length)
  )
  const [appState, setAppState] = useState<AppState>('input')
  const [isProcessing, setIsProcessing] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [loadingConfig, setLoadingConfig] = useState<LoadingStateConfig>(LOADING_MESSAGES.READING_FILE)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string>('')

  // Session state (from backend)
  const [currentSession, setCurrentSession] = useState<BackendSession | null>(null)
  const [sessionHistory, setSessionHistory] = useState<BackendSession[]>([])

  // Guest mode state
  const [isGuestMode, setIsGuestMode] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalReason, setAuthModalReason] = useState<'calendar' | 'session_limit' | 'view_session'>('calendar')

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
            getUserSessions().then(setSessionHistory).catch(console.error)
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
      // Check if guest can access this session
      const isGuestSession = GuestSessionManager.getSessionIds().includes(sessionId)

      if (!user && !isGuestSession) {
        // Not authenticated and not their guest session
        setAuthModalReason('view_session')
        setShowAuthModal(true)
        navigate('/')
        return
      }

      setIsProcessing(true)
      setAppState('loading')
      setLoadingConfig(LOADING_MESSAGES.READING_FILE)

      // Use guest endpoint if not authenticated and is a guest session
      const fetchSession = (!user && isGuestSession)
        ? getGuestSession(sessionId)
        : getSession(sessionId)

      fetchSession
        .then(session => {
          setCurrentSession(session)

          if (session.processed_events && session.processed_events.length > 0) {
            setCalendarEvents(session.processed_events as CalendarEvent[])
            setAppState('review')
          } else {
            setAppState('input')
          }
        })
        .catch(error => {
          console.error('Failed to load session:', error)

          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          if (errorMessage.includes('authentication') || errorMessage.includes('requires authentication')) {
            setAuthModalReason('view_session')
            setShowAuthModal(true)
          } else {
            toast.error('Failed to Load Session', {
              description: 'The session could not be found.',
              duration: 5000,
            })
          }
          navigate('/')
          setAppState('input')
        })
        .finally(() => {
          setIsProcessing(false)
        })
    }
  }, [sessionId, navigate, user])

  // Load session history and sync calendar when user logs in
  useEffect(() => {
    if (user) {
      getUserSessions().then(setSessionHistory).catch(console.error)

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
    }
  }, [user])

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  // Process file upload
  const processFile = useCallback(async (file: File) => {
    if (isProcessing) {
      toast.warning('Already Processing', {
        description: 'Please wait for the current file to finish processing.',
        duration: 3000,
      })
      return
    }

    // Check if guest and at limit
    if (!user && GuestSessionManager.hasReachedLimit()) {
      setAuthModalReason('session_limit')
      setShowAuthModal(true)
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

      // Track guest session with access token
      if (!user && session.access_token) {
        GuestSessionManager.addGuestSession(session.id, session.access_token)
      }

      setLoadingConfig(LOADING_MESSAGES.PROCESSING_FILE)

      // Poll for completion (use guest endpoint if not authenticated)
      const completedSession = await pollSession(
        session.id,
        (updatedSession) => {
          setCurrentSession(updatedSession)

          // Update loading message based on status
          if (updatedSession.status === 'processing') {
            setLoadingConfig(LOADING_MESSAGES.EXTRACTING_EVENTS)
          }
        },
        2000,
        !user // isGuest parameter
      )

      // Check if events were found
      if (!completedSession.processed_events || completedSession.processed_events.length === 0) {
        setFeedbackMessage("Hmm, we couldn't find any events in there. Try a different file!")
        setAppState('input')
        return
      }

      // Display results
      setCalendarEvents(completedSession.processed_events as CalendarEvent[])
      setAppState('review')

      // Navigate to the session URL
      navigate(`/s/${completedSession.id}`)

      // Refresh session history (only for authenticated users)
      if (user) {
        getUserSessions().then(setSessionHistory).catch(console.error)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      addNotification(createErrorNotification("Oops! Something went wrong. Mind trying that again?"))
      setAppState('input')
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing, navigate, user])

  // Process text input
  const processText = useCallback(async (text: string) => {
    if (isProcessing) {
      toast.warning('Already Processing', {
        description: 'Please wait for the current input to finish processing.',
        duration: 3000,
      })
      return
    }

    // Check if guest and at limit
    if (!user && GuestSessionManager.hasReachedLimit()) {
      setAuthModalReason('session_limit')
      setShowAuthModal(true)
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

      // Track guest session with access token
      if (!user && session.access_token) {
        GuestSessionManager.addGuestSession(session.id, session.access_token)
      }

      // Poll for completion (use guest endpoint if not authenticated)
      const completedSession = await pollSession(
        session.id,
        (updatedSession) => {
          setCurrentSession(updatedSession)

          // Update loading message based on status
          if (updatedSession.status === 'processing') {
            setLoadingConfig(LOADING_MESSAGES.EXTRACTING_EVENTS)
          }
        },
        2000,
        !user // isGuest parameter
      )

      // Check if events were found
      if (!completedSession.processed_events || completedSession.processed_events.length === 0) {
        setFeedbackMessage("The text doesn't appear to contain any calendar events.")
        setAppState('input')
        return
      }

      // Display results
      setCalendarEvents(completedSession.processed_events as CalendarEvent[])
      setAppState('review')

      // Navigate to the session URL
      navigate(`/s/${completedSession.id}`)

      // Refresh session history (only for authenticated users)
      if (user) {
        getUserSessions().then(setSessionHistory).catch(console.error)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      addNotification(createErrorNotification("Oops! Something went wrong. Mind trying that again?"))
      setAppState('input')
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
      toast.error('Recording Too Short', {
        description: 'Please record for at least a few seconds.',
        duration: 4000,
      })
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
    navigate(`/s/${sessionId}`)
    setSidebarOpen(false)
  }, [navigate])

  // Handle new session
  const handleNewSession = useCallback(() => {
    navigate('/')
    setSidebarOpen(false)
  }, [navigate])

  // Handle adding events to Google Calendar
  const handleAddToCalendar = useCallback(async (editedEvents?: CalendarEvent[]) => {
    // Require auth for calendar operations
    if (!user) {
      setAuthModalReason('calendar')
      setShowAuthModal(true)
      return
    }

    if (!currentSession) {
      toast.error('No Session', {
        description: 'No session available to add to calendar.',
        duration: 3000,
      })
      return
    }

    try {
      toast.loading('Adding to Calendar...', {
        id: 'calendar-add',
        description: 'Creating events in Google Calendar...',
      })

      // Pass edited events for correction logging
      const result = await addSessionToCalendar(currentSession.id, editedEvents)

      // Dismiss loading toast
      toast.dismiss('calendar-add')

      // Show success message
      if (result.has_conflicts) {
        toast.warning('Events Added with Conflicts', {
          description: `Created ${result.num_events_created} event(s), but found ${result.conflicts.length} scheduling conflict(s).`,
          duration: 5000,
        })
      } else {
        toast.success('Added to Calendar!', {
          description: `Successfully created ${result.num_events_created} event(s) in Google Calendar.`,
          duration: 4000,
        })
      }

      // Reload the session to get updated calendar_event_ids
      const updatedSession = await getSession(currentSession.id)
      setCurrentSession(updatedSession)

    } catch (error) {
      toast.dismiss('calendar-add')

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Check if it's an auth error
      if (errorMessage.includes('not connected') || errorMessage.includes('not authenticated')) {
        toast.error('Google Calendar Not Connected', {
          description: 'Please sign in with Google to use calendar integration.',
          duration: 5000,
        })
      } else {
        toast.error('Failed to Add to Calendar', {
          description: errorMessage,
          duration: 5000,
        })
      }
    }
  }, [user, currentSession])

  // Convert backend sessions to menu format
  const menuSessions: SessionListItem[] = sessionHistory.map(session => ({
    id: session.id,
    title: session.input_content.substring(0, 50) + (session.input_content.length > 50 ? '...' : ''),
    timestamp: new Date(session.created_at),
    inputType: session.input_type as 'text' | 'image' | 'audio',
    status: session.status === 'processed' ? 'completed' : session.status === 'error' ? 'error' : 'active',
    eventCount: session.processed_events?.length || 0,
  }))

  return (
    <div className="app">
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        reason={authModalReason}
      />
      <Menu
        isOpen={sidebarOpen}
        onToggle={handleSidebarToggle}
        sessions={menuSessions}
        currentSessionId={currentSession?.id}
        onSessionClick={handleSessionClick}
        onNewSession={handleNewSession}
      />
      <Toaster
        position="bottom-center"
        richColors
        closeButton
        toastOptions={{
          style: {
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        }}
      />
      <div className={`content ${sidebarOpen ? 'with-sidebar' : ''} ${appState === 'loading' || appState === 'review' ? 'events-view' : ''}`}>
        <Workspace
          appState={appState}
          uploadedFile={null}
          isProcessing={isProcessing}
          loadingConfig={[loadingConfig]}
          feedbackMessage={feedbackMessage}
          greetingImage={greetingImagePaths[currentGreetingIndex]}
          isGuestMode={isGuestMode}
          calendarEvents={calendarEvents}
          expectedEventCount={calendarEvents.length}
          onFileUpload={handleFileUpload}
          onAudioSubmit={handleAudioSubmit}
          onTextSubmit={handleTextSubmit}
          onClearFile={handleClearFile}
          onClearFeedback={() => setFeedbackMessage('')}
          onConfirm={handleAddToCalendar}
          onMenuToggle={handleSidebarToggle}
          onNewSession={handleNewSession}
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
        <Route path="*" element={<NotFound />} />
      </Routes>
    </NotificationProvider>
  )
}

export default App
