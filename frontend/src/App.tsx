import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { validateFile } from './utils/fileValidation'
import { MainInputArea } from './input/main-area'
import { GoogleCalendarAuth } from './components/GoogleCalendarAuth'
import { EventConfirmation } from './components/EventConfirmation'
import { Sidebar } from './components/Sidebar'
import type { CalendarEvent } from './types/calendarEvent'
import type { LoadingStateConfig } from './types/loadingState'
import { LOADING_MESSAGES } from './types/loadingState'
import type { Session } from './types/session'
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
} from './utils/sessionManager'
import './App.css'

// Import all greeting images dynamically
const greetingImages = import.meta.glob('./assets/greetings/*.{png,jpg,jpeg,svg}', { eager: true, as: 'url' })
const greetingImagePaths = Object.values(greetingImages) as string[]

type AppState = 'input' | 'loading' | 'review'

function App() {
  const [currentGreetingIndex] = useState(() =>
    Math.floor(Math.random() * greetingImagePaths.length)
  )
  const [appState, setAppState] = useState<AppState>('input')

  // Expose sessionCache to window for debugging
  useEffect(() => {
    (window as any).sessionCache = sessionCache
  }, [])
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [_extractedEvents, setExtractedEvents] = useState<any[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [_isCalendarAuthenticated, setIsCalendarAuthenticated] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState<LoadingStateConfig[]>([{ message: 'Processing...' }])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Session management state
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [sessionHistory, setSessionHistory] = useState<Session[]>([])

  // Sync session history from cache
  useEffect(() => {
    setSessionHistory(sessionCache.getAll())
  }, [currentSession])

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
    setLoadingConfig([LOADING_MESSAGES.READING_FILE])

    // CREATE NEW SESSION
    let session = createSession('file', file.name, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      timestamp: new Date(),
    })
    setCurrentSession(session)
    sessionCache.save(session)

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
      sessionCache.save(session)

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
      sessionCache.save(session)

      // Step 2: Analyze context to understand user intent
      setLoadingConfig([LOADING_MESSAGES.UNDERSTANDING_CONTEXT])
      session = updateProgress(session, {
        stage: 'processing_input',
        message: 'Analyzing context and user intent...'
      })
      setCurrentSession(session)
      sessionCache.save(session)

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
      sessionCache.save(session)

      // Step 3: Extract events from processed input (guided by context)
      setLoadingConfig([LOADING_MESSAGES.EXTRACTING_EVENTS])
      session = updateProgress(session, { stage: 'extracting_events' })
      setCurrentSession(session)
      sessionCache.save(session)

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
      sessionCache.save(session)

      if (extractResult.has_events) {
        setExtractedEvents(extractResult.events)

        // Step 3: Process each event through fact extraction and calendar formatting
        const formattedEvents = []
        const totalEvents = extractResult.events.length

        for (let i = 0; i < extractResult.events.length; i++) {
          const event = extractResult.events[i]
          const eventNum = i + 1

          // Show progress for multi-event processing
          setLoadingConfig([LOADING_MESSAGES.PROCESSING_EVENTS(eventNum, totalEvents)])
          session = updateProgress(session, {
            stage: 'extracting_facts',
            currentEvent: eventNum,
            totalEvents,
          })
          setCurrentSession(session)

          // Extract facts
          setLoadingConfig([{
            message: `Analyzing event (${eventNum}/${totalEvents})...`,
            icon: LOADING_MESSAGES.EXTRACTING_FACTS.icon
          }])

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
          setLoadingConfig([{
            message: `Formatting event (${eventNum}/${totalEvents})...`,
            icon: LOADING_MESSAGES.FORMATTING_CALENDAR.icon
          }])
          session = updateProgress(session, {
            stage: 'formatting_calendar',
            currentEvent: eventNum,
            totalEvents,
          })
          setCurrentSession(session)

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

          formattedEvents.push(calendarEvent)
        }

        // Complete session
        session = setSessionCalendarEvents(session, formattedEvents)
        session = completeSession(session, 'completed')
        setCurrentSession(session)
        sessionCache.save(session)

        setCalendarEvents(formattedEvents)
        setAppState('review')
      } else {
        // Complete session as cancelled (no events)
        session = completeSession(session, 'cancelled')
        setCurrentSession(session)
        sessionCache.save(session)

        // Info toast (not an error, just no events found)
        toast.info('No Events Found', {
          description: 'The file doesn\'t appear to contain any calendar events.',
          duration: 4000,
        })
        setUploadedFile(null)
        setAppState('input')
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
    setLoadingConfig([LOADING_MESSAGES.PROCESSING_TEXT])

    // CREATE NEW SESSION
    let session = createSession('text', text, {
      textLength: text.length,
      timestamp: new Date(),
    })
    setCurrentSession(session)
    sessionCache.save(session)

    try {
      // Step 1: Analyze context to understand user intent
      setLoadingConfig([LOADING_MESSAGES.UNDERSTANDING_CONTEXT])
      session = updateProgress(session, {
        stage: 'processing_input',
        message: 'Analyzing context and user intent...'
      })
      setCurrentSession(session)
      sessionCache.save(session)

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
      sessionCache.save(session)

      // Step 2: Extract events from text input (guided by context)
      setLoadingConfig([LOADING_MESSAGES.EXTRACTING_EVENTS])
      session = updateProgress(session, { stage: 'extracting_events' })
      setCurrentSession(session)
      sessionCache.save(session)

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
      sessionCache.save(session)

      if (extractResult.has_events) {
        setExtractedEvents(extractResult.events)

        // Process each event through fact extraction and calendar formatting
        const formattedEvents = []
        const totalEvents = extractResult.events.length

        for (let i = 0; i < extractResult.events.length; i++) {
          const event = extractResult.events[i]
          const eventNum = i + 1

          // Show progress for multi-event processing
          setLoadingConfig([LOADING_MESSAGES.PROCESSING_EVENTS(eventNum, totalEvents)])
          session = updateProgress(session, {
            stage: 'extracting_facts',
            currentEvent: eventNum,
            totalEvents,
          })
          setCurrentSession(session)

          // Extract facts
          setLoadingConfig([{
            message: `Analyzing event (${eventNum}/${totalEvents})...`,
            icon: LOADING_MESSAGES.EXTRACTING_FACTS.icon
          }])

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
          setLoadingConfig([{
            message: `Formatting event (${eventNum}/${totalEvents})...`,
            icon: LOADING_MESSAGES.FORMATTING_CALENDAR.icon
          }])
          session = updateProgress(session, {
            stage: 'formatting_calendar',
            currentEvent: eventNum,
            totalEvents,
          })
          setCurrentSession(session)

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

          formattedEvents.push(calendarEvent)
        }

        // Complete session
        session = setSessionCalendarEvents(session, formattedEvents)
        session = completeSession(session, 'completed')
        setCurrentSession(session)
        sessionCache.save(session)

        setCalendarEvents(formattedEvents)
        setAppState('review')
      } else {
        // Complete session as cancelled (no events)
        session = completeSession(session, 'cancelled')
        setCurrentSession(session)
        sessionCache.save(session)

        // Info toast (not an error, just no events found)
        toast.info('No Events Found', {
          description: 'The text doesn\'t appear to contain any calendar events.',
          duration: 4000,
        })
        setUploadedFile(null)
        setAppState('input')
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
    }
  }, [])

  // New session handler
  const handleNewSession = useCallback(() => {
    setCurrentSession(null)
    setCalendarEvents([])
    setExtractedEvents([])
    setUploadedFile(null)
    setAppState('input')
  }, [])

  return (
    <div className="app">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
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
      <div className={`content ${sidebarOpen ? 'with-sidebar' : ''}`}>
        {/* Show greeting only in input and loading states */}
        {(appState === 'input' || appState === 'loading') && (
          <motion.div
            className="greeting-container"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <img
              src={greetingImagePaths[currentGreetingIndex]}
              alt="Greeting"
              className="greeting-image"
            />
          </motion.div>
        )}

        {/* Show MainInputArea only when in input or loading state */}
        {(appState === 'input' || appState === 'loading') && (
          <MainInputArea
            uploadedFile={uploadedFile}
            isProcessing={isProcessing}
            loadingConfig={loadingConfig}
            onFileUpload={handleFileUpload}
            onAudioSubmit={handleAudioSubmit}
            onTextSubmit={handleTextSubmit}
            onClearFile={handleClearFile}
          />
        )}

        {/* Show EventConfirmation only when in review state */}
        {appState === 'review' && calendarEvents.length > 0 && (
          <EventConfirmation
            events={calendarEvents}
            onConfirm={() => {
              // TODO: Implement add to calendar functionality
              toast.success('Adding to calendar...', {
                description: 'This feature will be implemented soon!',
                duration: 3000,
              })
            }}
          />
        )}

        {/* Google Calendar Authentication - only show in input and loading states */}
        {(appState === 'input' || appState === 'loading') && (
          <GoogleCalendarAuth onAuthChange={setIsCalendarAuthenticated} />
        )}
      </div>
    </div>
  )
}

export default App
