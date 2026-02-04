import { useState, useCallback, useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { validateFile } from './workspace/input/validation'
import { Workspace } from './workspace/Workspace'
import { Menu } from './menu/Menu'
import { useAuth } from './auth/AuthContext'
import type { CalendarEvent } from './workspace/events/types'
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

function App() {
  const { user } = useAuth()
  const [currentGreetingIndex] = useState(() =>
    Math.floor(Math.random() * greetingImagePaths.length)
  )
  const [appState, setAppState] = useState<AppState>('input')
  const [isProcessing, setIsProcessing] = useState(false)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [loadingMessage, setLoadingMessage] = useState('Processing...')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string>('')

  // Session state (from backend)
  const [currentSession, setCurrentSession] = useState<BackendSession | null>(null)
  const [sessionHistory, setSessionHistory] = useState<BackendSession[]>([])

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
    setLoadingMessage('Uploading file...')

    try {
      // Determine file type
      const fileType = file.type.startsWith('audio/') ? 'audio' : 'image'

      // Upload file and create session
      const { session } = await apiUploadFile(file, fileType)
      setCurrentSession(session)
      setLoadingMessage('Processing file...')

      // Poll for completion
      const completedSession = await pollSession(session.id, (updatedSession) => {
        setCurrentSession(updatedSession)

        // Update loading message based on status
        if (updatedSession.status === 'processing') {
          setLoadingMessage('Extracting calendar events...')
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
  }, [isProcessing])

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
    setLoadingMessage('Processing text...')

    try {
      // Create text session
      const session = await createTextSession(text)
      setCurrentSession(session)

      // Poll for completion
      const completedSession = await pollSession(session.id, (updatedSession) => {
        setCurrentSession(updatedSession)

        // Update loading message based on status
        if (updatedSession.status === 'processing') {
          setLoadingMessage('Extracting calendar events...')
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
  }, [isProcessing])

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
  const handleSessionClick = useCallback(async (sessionId: string) => {
    try {
      const session = await getSession(sessionId)
      setCurrentSession(session)

      if (session.processed_events && session.processed_events.length > 0) {
        setCalendarEvents(session.processed_events as CalendarEvent[])
        setAppState('review')
      } else {
        setAppState('input')
      }

      setSidebarOpen(false)
    } catch (error) {
      toast.error('Failed to load session')
    }
  }, [])

  // Handle new session
  const handleNewSession = useCallback(() => {
    setCurrentSession(null)
    setCalendarEvents([])
    setAppState('input')
    setSidebarOpen(false)
  }, [])

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
      <div className={`content ${sidebarOpen ? 'with-sidebar' : ''}`}>
        <Workspace
          appState={appState}
          uploadedFile={null}
          isProcessing={isProcessing}
          loadingConfig={[{ message: loadingMessage }]}
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

export default App
