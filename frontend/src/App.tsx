import { useState, useCallback, useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { validateFile } from './workspace/input/validation'
import { Workspace } from './workspace/Workspace'
import { Menu } from './menu/Menu'
import type { CalendarEvent } from './workspace/events/types'
import type { LoadingStateConfig } from './workspace/events/types'
import { LOADING_MESSAGES } from './workspace/events/types'
import type { Session } from './sessions'
import {
  createSession,
  addAgentOutput,
  updateProgress,
  setContext,
  setExtractedEvents as setSessionExtractedEvents,
  setCalendarEvents as setSessionCalendarEvents,
  completeSession,
  toSessionListItem,
  sessionCache,
  useSessionHistory,
} from './sessions'
import { useIsMobile } from './hooks/useIsMobile'
import './App.css'

// Import all greeting images dynamically
const greetingImages = import.meta.glob('./assets/greetings/*.{png,jpg,jpeg,svg}', { eager: true, as: 'url' })
const greetingImagePaths = Object.values(greetingImages) as string[]

type AppState = 'input' | 'loading' | 'review'
type MobileView = 'sidebar' | 'main'

function App() {
  const [currentGreetingIndex] = useState(() =>
    Math.floor(Math.random() * greetingImagePaths.length)
  )
  const [appState, setAppState] = useState<AppState>('input')
  const isMobile = useIsMobile()
  const [mobileView, setMobileView] = useState<MobileView>('main')

  // Expose sessionCache to window for debugging
  useEffect(() => {
    (window as any).sessionCache = sessionCache
  }, [])
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [_extractedEvents, setExtractedEvents] = useState<any[]>([])
  const [calendarEvents, setCalendarEvents] = useState<(CalendarEvent | null)[]>([])
  const [_isCalendarAuthenticated, setIsCalendarAuthenticated] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState<LoadingStateConfig[]>([{ message: 'Processing...' }])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Handle sidebar toggle differently for mobile vs desktop
  const handleSidebarToggle = useCallback(() => {
    if (isMobile) {
      // On mobile, switch between views
      setMobileView(prev => prev === 'sidebar' ? 'main' : 'sidebar')
    } else {
      // On desktop, just toggle sidebar open/closed
      setSidebarOpen(prev => !prev)
    }
  }, [isMobile])
  const [expectedEventCount, setExpectedEventCount] = useState<number | undefined>(undefined)
  const [feedbackMessage, setFeedbackMessage] = useState<string>('')

  // Session management state
  const [currentSession, setCurrentSession] = useState<Session | null>(null)

  // Auto-sync session history using observer pattern
  const sessionHistory = useSessionHistory()

  const processFile = useCallback(async (file: File) => {
    // Prevent duplicate processing
    if (isProcessing) {
      toast.warning('Already Processing', {
        description: 'Please wait for the current file to finish processing.',
        duration: 3000,
      })
      return
    }

    // Validate file before processing
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
    setExtractedEvents([])
    setExpectedEventCount(undefined)
    setFeedbackMessage('') // Clear any previous feedback
    setLoadingConfig([LOADING_MESSAGES.READING_FILE])

    // CREATE NEW SESSION (will only be saved if events are found)
    let session = createSession('file', file.name, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      timestamp: new Date(),
    })

    try {
      // Step 1: Process the file (extract text or prepare for vision)
      const formData = new FormData()
      formData.append('file', file)

      setLoadingConfig([LOADING_MESSAGES.PROCESSING_FILE])
      session = updateProgress(session, {
        stage: 'processing_input',
        message: 'Processing file...',
      })
      setCurrentSession(session)
      // Don't save to cache yet - wait until we confirm there are events

      const processStart = Date.now()
      const processResponse = await fetch('http://localhost:5000/api/process', {
        method: 'POST',
        body: formData,
      })

      if (!processResponse.ok) {
        const errorData = await processResponse.json()
        throw new Error(errorData.error || 'Failed to process file')
      }

      const processResult = await processResponse.json()
      const processDuration = Date.now() - processStart

      // TRACK AGENT OUTPUT
      session = addAgentOutput(
        session,
        'FileProcessing',
        { fileName: file.name },
        processResult,
        true,
        processDuration
      )
      setCurrentSession(session)
      // Don't save to cache yet - wait until we confirm there are events

      // Step 2: Analyze context to understand user intent
      setLoadingConfig([LOADING_MESSAGES.UNDERSTANDING_CONTEXT])
      session = updateProgress(session, {
        stage: 'processing_input',
        message: 'Analyzing context and user intent...'
      })
      setCurrentSession(session)
      // Don't save to cache yet - wait until we confirm there are events

      const contextStart = Date.now()
      const contextResponse = await fetch('http://localhost:5000/api/analyze-context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: processResult.text || '',
          metadata: processResult.metadata || {},
        }),
      })

      if (!contextResponse.ok) {
        const errorData = await contextResponse.json()
        throw new Error(errorData.error || 'Failed to analyze context')
      }

      const contextResult = await contextResponse.json()
      const contextDuration = Date.now() - contextStart

      // TRACK AGENT OUTPUT and update session with context
      session = addAgentOutput(
        session,
        'ContextUnderstanding',
        { input: processResult.text },
        contextResult,
        true,
        contextDuration
      )
      session = setContext(session, contextResult)
      setCurrentSession(session)
      // Don't save to cache yet - wait until we confirm there are events

      // Step 3: Extract events from processed input (guided by context)
      setLoadingConfig([LOADING_MESSAGES.EXTRACTING_EVENTS])
      session = updateProgress(session, { stage: 'extracting_events' })
      setCurrentSession(session)
      // Don't save to cache yet - wait until we confirm there are events

      const extractStart = Date.now()
      const extractResponse = await fetch('http://localhost:5000/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: processResult.text || '',
          metadata: processResult.metadata || {},
          context: contextResult, // Pass context to guide extraction
        }),
      })

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json()
        throw new Error(errorData.error || 'Failed to extract events')
      }

      const extractResult = await extractResponse.json()
      const extractDuration = Date.now() - extractStart

      // Immediately set expected event count to update UI
      if (extractResult.num_events) {
        setExpectedEventCount(extractResult.num_events)
      }

      // TRACK AGENT OUTPUT
      session = addAgentOutput(
        session,
        'EventIdentification',
        { input: processResult.text },
        extractResult,
        true,
        extractDuration
      )
      session = setSessionExtractedEvents(session, extractResult.events || [])
      setCurrentSession(session)

      if (extractResult.has_events) {
        // NOW save to cache since we confirmed there are events
        sessionCache.save(session)
        setExtractedEvents(extractResult.events)

        // Step 3: Process all events in parallel through fact extraction and calendar formatting
        const totalEvents = extractResult.events.length
        setLoadingConfig([{
          message: `Processing ${totalEvents} ${totalEvents === 1 ? 'event' : 'events'}...`,
          icon: LOADING_MESSAGES.EXTRACTING_FACTS.icon
        }])
        session = updateProgress(session, {
          stage: 'extracting_facts',
          currentEvent: 0,
          totalEvents,
        })
        setCurrentSession(session)

        // Initialize calendar events array with nulls for streaming
        const streamingEvents: (CalendarEvent | null)[] = Array(totalEvents).fill(null)
        setCalendarEvents(streamingEvents)

        // Process all events in parallel, updating UI as each completes
        const eventPromises = extractResult.events.map(async (event: any, i: number) => {
          const eventNum = i + 1

          try {
            // Extract facts
            const factsStart = Date.now()
            const factsResponse = await fetch('http://localhost:5000/api/extract-facts', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                raw_text: event.raw_text,
                description: event.description,
              }),
            })

            if (!factsResponse.ok) {
              throw new Error('Failed to extract facts')
            }

            const facts = await factsResponse.json()
            const factsDuration = Date.now() - factsStart

            // TRACK AGENT OUTPUT
            session = addAgentOutput(
              session,
              `FactExtraction_Event${eventNum}`,
              { raw_text: event.raw_text, description: event.description },
              facts,
              true,
              factsDuration
            )
            setCurrentSession(session)
            sessionCache.save(session)

            // Format for calendar
            const calendarStart = Date.now()
            const calendarResponse = await fetch('http://localhost:5000/api/format-calendar', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ facts }),
            })

            if (!calendarResponse.ok) {
              throw new Error('Failed to format calendar event')
            }

            const calendarEvent = await calendarResponse.json()
            const calendarDuration = Date.now() - calendarStart

            // TRACK AGENT OUTPUT
            session = addAgentOutput(
              session,
              `CalendarFormatting_Event${eventNum}`,
              { facts },
              calendarEvent,
              true,
              calendarDuration
            )
            setCurrentSession(session)
            sessionCache.save(session)

            // Stream this event to UI immediately
            setCalendarEvents(prev => {
              const updated = [...prev]
              updated[i] = calendarEvent
              return updated
            })

            return calendarEvent
          } catch (error) {
            console.error(`Error processing event ${eventNum}:`, error)
            throw error
          }
        })

        // Wait for all events to complete
        const formattedEvents = await Promise.all(eventPromises)

        // Complete session
        session = setSessionCalendarEvents(session, formattedEvents)
        session = completeSession(session, 'completed')
        setCurrentSession(session)
        sessionCache.save(session)

        setAppState('review')
      } else {
        // No events found - don't save session, show feedback message instead
        setFeedbackMessage('The file doesn\'t appear to contain any calendar events.')
        setUploadedFile(null)
        setIsProcessing(false)
        setAppState('input')
        return // Exit early, don't save this session
      }
    } catch (err) {
      // Complete session as error
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      session = completeSession(session, 'error', errorMessage)
      setCurrentSession(session)
      sessionCache.save(session)

      let errorTitle = 'Processing Failed'

      // Handle different error types
      if (err instanceof TypeError && err.message.includes('fetch')) {
        errorTitle = 'Connection Error'
      }

      // Error toast with specific messaging
      toast.error(errorTitle, {
        description: errorMessage,
        duration: 6000,
      })

      console.error('Processing error:', err)
      setUploadedFile(null)
      setAppState('input')
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing])

  // Wrapper for file upload
  const handleFileUpload = useCallback((file: File) => {
    // Don't show the file in the input area, go straight to processing
    processFile(file)
  }, [processFile])

  // Wrapper for audio submission
  const handleAudioSubmit = useCallback((audioBlob: Blob) => {
    // Convert blob to file
    const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' })

    // Check if recording is too short/empty
    if (audioBlob.size < 1000) { // Less than 1KB
      toast.error('Recording Too Short', {
        description: 'Please record for at least a few seconds.',
        duration: 4000,
      })
      return
    }

    // Don't show the file in the input area, go straight to processing
    processFile(audioFile)
  }, [processFile])

  const processText = useCallback(async (text: string) => {
    // Prevent duplicate processing
    if (isProcessing) {
      toast.warning('Already Processing', {
        description: 'Please wait for the current input to finish processing.',
        duration: 3000,
      })
      return
    }

    setIsProcessing(true)
    setAppState('loading')
    setExtractedEvents([])
    setExpectedEventCount(undefined)
    setFeedbackMessage('') // Clear any previous feedback
    setLoadingConfig([LOADING_MESSAGES.PROCESSING_TEXT])

    // CREATE NEW SESSION with short title (will only be saved if events are found)
    const title = text.length > 50 ? text.substring(0, 50).trim() + '...' : text.trim()
    let session = createSession('text', title, {
      textLength: text.length,
      timestamp: new Date(),
    })

    try {
      // Step 1: Analyze context to understand user intent
      setLoadingConfig([LOADING_MESSAGES.UNDERSTANDING_CONTEXT])
      session = updateProgress(session, {
        stage: 'processing_input',
        message: 'Analyzing context and user intent...'
      })
      setCurrentSession(session)
      // Don't save to cache yet - wait until we confirm there are events

      const contextStart = Date.now()
      const contextResponse = await fetch('http://localhost:5000/api/analyze-context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          metadata: {},
        }),
      })

      if (!contextResponse.ok) {
        const errorData = await contextResponse.json()
        throw new Error(errorData.error || 'Failed to analyze context')
      }

      const contextResult = await contextResponse.json()
      const contextDuration = Date.now() - contextStart

      // TRACK AGENT OUTPUT and update session with context
      session = addAgentOutput(
        session,
        'ContextUnderstanding',
        { input: text },
        contextResult,
        true,
        contextDuration
      )
      session = setContext(session, contextResult)
      setCurrentSession(session)
      // Don't save to cache yet - wait until we confirm there are events

      // Step 2: Extract events from text input (guided by context)
      setLoadingConfig([LOADING_MESSAGES.EXTRACTING_EVENTS])
      session = updateProgress(session, { stage: 'extracting_events' })
      setCurrentSession(session)
      // Don't save to cache yet - wait until we confirm there are events

      const extractStart = Date.now()
      const extractResponse = await fetch('http://localhost:5000/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          metadata: {},
          context: contextResult, // Pass context to guide extraction
        }),
      })

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json()
        throw new Error(errorData.error || 'Failed to extract events')
      }

      const extractResult = await extractResponse.json()
      const extractDuration = Date.now() - extractStart

      // Immediately set expected event count to update UI
      if (extractResult.num_events) {
        setExpectedEventCount(extractResult.num_events)
      }

      // TRACK AGENT OUTPUT
      session = addAgentOutput(
        session,
        'EventIdentification',
        { input: text },
        extractResult,
        true,
        extractDuration
      )
      session = setSessionExtractedEvents(session, extractResult.events || [])
      setCurrentSession(session)

      if (extractResult.has_events) {
        // NOW save to cache since we confirmed there are events
        sessionCache.save(session)
        setExtractedEvents(extractResult.events)

        // Process all events in parallel through fact extraction and calendar formatting
        const totalEvents = extractResult.events.length
        setLoadingConfig([{
          message: `Processing ${totalEvents} ${totalEvents === 1 ? 'event' : 'events'}...`,
          icon: LOADING_MESSAGES.EXTRACTING_FACTS.icon
        }])
        session = updateProgress(session, {
          stage: 'extracting_facts',
          currentEvent: 0,
          totalEvents,
        })
        setCurrentSession(session)

        // Initialize calendar events array with nulls for streaming
        const streamingEvents: (CalendarEvent | null)[] = Array(totalEvents).fill(null)
        setCalendarEvents(streamingEvents)

        // Process all events in parallel, updating UI as each completes
        const eventPromises = extractResult.events.map(async (event: any, i: number) => {
          const eventNum = i + 1

          try {
            // Extract facts
            const factsStart = Date.now()
            const factsResponse = await fetch('http://localhost:5000/api/extract-facts', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                raw_text: event.raw_text,
                description: event.description,
              }),
            })

            if (!factsResponse.ok) {
              throw new Error('Failed to extract facts')
            }

            const facts = await factsResponse.json()
            const factsDuration = Date.now() - factsStart

            // TRACK AGENT OUTPUT
            session = addAgentOutput(
              session,
              `FactExtraction_Event${eventNum}`,
              { raw_text: event.raw_text, description: event.description },
              facts,
              true,
              factsDuration
            )
            setCurrentSession(session)
            sessionCache.save(session)

            // Format for calendar
            const calendarStart = Date.now()
            const calendarResponse = await fetch('http://localhost:5000/api/format-calendar', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ facts }),
            })

            if (!calendarResponse.ok) {
              throw new Error('Failed to format calendar event')
            }

            const calendarEvent = await calendarResponse.json()
            const calendarDuration = Date.now() - calendarStart

            // TRACK AGENT OUTPUT
            session = addAgentOutput(
              session,
              `CalendarFormatting_Event${eventNum}`,
              { facts },
              calendarEvent,
              true,
              calendarDuration
            )
            setCurrentSession(session)
            sessionCache.save(session)

            // Stream this event to UI immediately
            setCalendarEvents(prev => {
              const updated = [...prev]
              updated[i] = calendarEvent
              return updated
            })

            return calendarEvent
          } catch (error) {
            console.error(`Error processing event ${eventNum}:`, error)
            throw error
          }
        })

        // Wait for all events to complete
        const formattedEvents = await Promise.all(eventPromises)

        // Complete session
        session = setSessionCalendarEvents(session, formattedEvents)
        session = completeSession(session, 'completed')
        setCurrentSession(session)
        sessionCache.save(session)

        setAppState('review')
      } else {
        // No events found - don't save session, show feedback message instead
        setFeedbackMessage('The text doesn\'t appear to contain any calendar events.')
        setUploadedFile(null)
        setIsProcessing(false)
        setAppState('input')
        return // Exit early, don't save this session
      }
    } catch (err) {
      // Complete session as error
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      session = completeSession(session, 'error', errorMessage)
      setCurrentSession(session)
      sessionCache.save(session)

      let errorTitle = 'Processing Failed'

      // Handle different error types
      if (err instanceof TypeError && err.message.includes('fetch')) {
        errorTitle = 'Connection Error'
      }

      // Error toast with specific messaging
      toast.error(errorTitle, {
        description: errorMessage,
        duration: 6000,
      })

      console.error('Processing error:', err)
      setUploadedFile(null)
      setAppState('input')
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing])

  // Wrapper for text submission
  const handleTextSubmit = useCallback((text: string) => {
    processText(text)
  }, [processText])

  // Wrapper for clearing file
  const handleClearFile = useCallback(() => {
    setUploadedFile(null)
    setExtractedEvents([])
    setCalendarEvents([])
    setAppState('input')
  }, [])

  // Session restoration handler
  const handleSessionClick = useCallback((sessionId: string) => {
    const session = sessionCache.get(sessionId)
    if (session) {
      setCurrentSession(session)
      setCalendarEvents(session.calendarEvents)
      setExtractedEvents(session.extractedEvents)

      // Update UI based on session status
      if (session.status === 'completed' && session.calendarEvents.length > 0) {
        setAppState('review')
      } else if (session.status === 'active') {
        setAppState('loading')
      } else {
        setAppState('input')
      }

      // On mobile, switch back to main view after selecting a session
      if (isMobile) {
        setMobileView('main')
      }
    }
  }, [isMobile])

  // New session handler
  const handleNewSession = useCallback(() => {
    setCurrentSession(null)
    setCalendarEvents([])
    setExtractedEvents([])
    setUploadedFile(null)
    setAppState('input')
    // On mobile, switch back to main view when starting new session
    if (isMobile) {
      setMobileView('main')
    }
  }, [isMobile])

  // Determine sidebar visibility based on mobile/desktop
  const isSidebarVisible = isMobile ? mobileView === 'sidebar' : sidebarOpen
  const isMainVisible = isMobile ? mobileView === 'main' : true

  return (
    <div className="app">
      <Menu
        isOpen={isSidebarVisible}
        onToggle={handleSidebarToggle}
        sessions={sessionHistory.map(toSessionListItem)}
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
      {isMainVisible && (
        <div className={`content ${sidebarOpen ? 'with-sidebar' : ''} ${isMobile ? 'mobile-view' : ''}`}>
          <Workspace
            appState={appState}
            uploadedFile={uploadedFile}
            isProcessing={isProcessing}
            loadingConfig={loadingConfig}
            feedbackMessage={feedbackMessage}
            greetingImage={greetingImagePaths[currentGreetingIndex]}
            calendarEvents={calendarEvents}
            expectedEventCount={expectedEventCount}
            onFileUpload={handleFileUpload}
            onAudioSubmit={handleAudioSubmit}
            onTextSubmit={handleTextSubmit}
            onClearFile={handleClearFile}
            onClearFeedback={() => setFeedbackMessage('')}
            onConfirm={() => {
              // TODO: Implement add to calendar functionality
              toast.success('Adding to calendar...', {
                description: 'This feature will be implemented soon!',
                duration: 3000,
              })
            }}
            onAuthChange={setIsCalendarAuthenticated}
          />
        </div>
      )}
    </div>
  )
}

export default App
