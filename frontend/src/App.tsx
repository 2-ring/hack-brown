import { useState, useCallback, useEffect } from 'react'
import { Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { validateFile } from './workspace/input/validation'
import { Workspace } from './workspace/Workspace'
import { Menu } from './menu/Menu'
import { Plans } from './payment/Plans'
import { useAuth } from './auth/AuthContext'
import type { CalendarEvent, LoadingStateConfig } from './workspace/events/types'
import { LOADING_MESSAGES } from './workspace/events/types'
import type { Session as BackendSession } from './api/types'
import {
  createTextSession,
  uploadFile as apiUploadFile,
  getUserSessions,
  getSession,
  pollSession,
  addSessionToCalendar
} from './api/backend-client'
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

// TEMPORARY: Test data for events (spans two months to show month transition)
const TEST_EVENTS: CalendarEvent[] = [
  {
    summary: 'Team Standup',
    start: {
      dateTime: '2026-02-04T10:00:00',
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: '2026-02-04T10:30:00',
      timeZone: 'America/New_York'
    },
    location: 'Conference Room A',
    description: 'Daily team sync to discuss progress and blockers',
    calendar: 'Work'
  },
  {
    summary: 'Client Presentation',
    start: {
      dateTime: '2026-02-06T14:00:00',
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: '2026-02-06T15:30:00',
      timeZone: 'America/New_York'
    },
    location: 'Zoom Meeting',
    calendar: 'Work'
  },
  {
    summary: 'Hack@Brown 2026',
    start: {
      dateTime: '2026-02-07T09:00:00',
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: '2026-02-08T18:00:00',
      timeZone: 'America/New_York'
    },
    location: 'Brown University',
    description: 'Annual hackathon - Marshall Wace Track',
    calendar: 'School'
  },
  {
    summary: 'Coffee with Alex',
    start: {
      dateTime: '2026-02-10T15:00:00',
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: '2026-02-10T16:00:00',
      timeZone: 'America/New_York'
    },
    calendar: 'Personal'
  },
  {
    summary: 'Project Kickoff Meeting',
    start: {
      dateTime: '2026-03-02T09:00:00',
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: '2026-03-02T11:00:00',
      timeZone: 'America/New_York'
    },
    description: 'Q2 project planning and team alignment',
    calendar: 'Work'
  },
  {
    summary: 'Dentist Appointment',
    start: {
      dateTime: '2026-03-05T14:00:00',
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: '2026-03-05T15:00:00',
      timeZone: 'America/New_York'
    },
    location: 'Dr. Smith Dental',
    calendar: 'Personal'
  },
  {
    summary: 'Spring Break Trip',
    start: {
      dateTime: '2026-03-14T08:00:00',
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: '2026-03-21T20:00:00',
      timeZone: 'America/New_York'
    },
    location: 'Miami Beach',
    description: 'Week-long vacation',
    calendar: 'Personal'
  }
]

// Main content component that handles all the business logic
function AppContent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { sessionId } = useParams<{ sessionId?: string }>()

  const [currentGreetingIndex] = useState(() =>
    Math.floor(Math.random() * greetingImagePaths.length)
  )
  // TEMPORARY: Start with loading state to show events workspace immediately
  const [appState, setAppState] = useState<AppState>('loading')
  const [isProcessing, setIsProcessing] = useState(true)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [loadingConfig, setLoadingConfig] = useState<LoadingStateConfig>(LOADING_MESSAGES.READING_FILE)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string>('')

  // Session state (from backend)
  const [currentSession, setCurrentSession] = useState<BackendSession | null>(null)
  const [sessionHistory, setSessionHistory] = useState<BackendSession[]>([])

  // TEMPORARY: Show loading sequence for 5 seconds, then load test data (only when no sessionId)
  useEffect(() => {
    if (!sessionId) {
      const loadingSequence = [
        { config: LOADING_MESSAGES.READING_FILE, delay: 0 },
        { config: LOADING_MESSAGES.UNDERSTANDING_CONTEXT, delay: 1000 },
        { config: LOADING_MESSAGES.EXTRACTING_EVENTS, delay: 2000 },
        { config: LOADING_MESSAGES.EXTRACTING_FACTS, delay: 3500 },
        { config: LOADING_MESSAGES.FORMATTING_CALENDAR, delay: 4500 }
      ]

      const timers = loadingSequence.map(({ config, delay }) =>
        setTimeout(() => setLoadingConfig(config), delay)
      )

      const finalTimer = setTimeout(() => {
        setCalendarEvents(TEST_EVENTS)
        setAppState('review')
        setIsProcessing(false)
      }, 5000)

      return () => {
        timers.forEach(clearTimeout)
        clearTimeout(finalTimer)
      }
    }
  }, [sessionId])

  // Load session from URL on mount or when sessionId changes
  useEffect(() => {
    if (sessionId) {
      setIsProcessing(true)
      setAppState('loading')
      setLoadingConfig(LOADING_MESSAGES.READING_FILE)

      getSession(sessionId)
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
          toast.error('Failed to Load Session', {
            description: 'The session could not be found.',
            duration: 5000,
          })
          navigate('/')
          setAppState('input')
        })
        .finally(() => {
          setIsProcessing(false)
        })
    }
    // TEMPORARY: When no sessionId, we let the test data loading sequence handle the state
  }, [sessionId, navigate])

  // Load session history when user logs in
  useEffect(() => {
    if (user) {
      getUserSessions().then(setSessionHistory).catch(console.error)
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

    const validation = validateFile(file)
    if (!validation.valid) {
      toast.error('Invalid File', {
        description: validation.error,
        duration: 5000,
      })
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

      // Upload file and create session
      const { session } = await apiUploadFile(file, fileType)
      setCurrentSession(session)
      setLoadingConfig(LOADING_MESSAGES.PROCESSING_FILE)

      // Poll for completion
      const completedSession = await pollSession(session.id, (updatedSession) => {
        setCurrentSession(updatedSession)

        // Update loading message based on status
        if (updatedSession.status === 'processing') {
          setLoadingConfig(LOADING_MESSAGES.EXTRACTING_EVENTS)
        }
      })

      // Check if events were found
      if (!completedSession.processed_events || completedSession.processed_events.length === 0) {
        setFeedbackMessage("The file doesn't appear to contain any calendar events.")
        setAppState('input')
        return
      }

      // Display results
      setCalendarEvents(completedSession.processed_events as CalendarEvent[])
      setAppState('review')

      // Navigate to the session URL
      navigate(`/s/${completedSession.id}`)

      // Refresh session history
      getUserSessions().then(setSessionHistory).catch(console.error)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Processing Failed', {
        description: errorMessage,
        duration: 6000,
      })
      setAppState('input')
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing, navigate])

  // Process text input
  const processText = useCallback(async (text: string) => {
    if (isProcessing) {
      toast.warning('Already Processing', {
        description: 'Please wait for the current input to finish processing.',
        duration: 3000,
      })
      return
    }

    setIsProcessing(true)
    setAppState('loading')
    setCalendarEvents([])
    setFeedbackMessage('')
    setLoadingConfig(LOADING_MESSAGES.PROCESSING_TEXT)

    try {
      // Create text session
      const session = await createTextSession(text)
      setCurrentSession(session)

      // Poll for completion
      const completedSession = await pollSession(session.id, (updatedSession) => {
        setCurrentSession(updatedSession)

        // Update loading message based on status
        if (updatedSession.status === 'processing') {
          setLoadingConfig(LOADING_MESSAGES.EXTRACTING_EVENTS)
        }
      })

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

      // Refresh session history
      getUserSessions().then(setSessionHistory).catch(console.error)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Processing Failed', {
        description: errorMessage,
        duration: 6000,
      })
      setAppState('input')
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing, navigate])

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
  const handleAddToCalendar = useCallback(async () => {
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

      const result = await addSessionToCalendar(currentSession.id)

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
  }, [currentSession])

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
    <Routes>
      <Route path="/" element={<AppContent />} />
      <Route path="/s/:sessionId" element={<AppContent />} />
      <Route path="/plans" element={<Plans />} />
    </Routes>
  )
}

export default App
