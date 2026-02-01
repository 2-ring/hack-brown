import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { validateFile } from './utils/fileValidation'
import { MainInputArea } from './input/main-area'
import { GoogleCalendarAuth } from './components/GoogleCalendarAuth'
import { EventConfirmation } from './components/EventConfirmation'
import type { LoadingPhase } from './types/loadingState'
import type { CalendarEvent } from './types/calendarEvent'
import { LOADING_PHASES } from './types/loadingState'
import './App.css'

// Import all greeting images dynamically
const greetingImages = import.meta.glob('./assets/greetings/*.{png,jpg,jpeg,svg}', { eager: true, as: 'url' })
const greetingImagePaths = Object.values(greetingImages) as string[]

function App() {
  const [currentGreetingIndex] = useState(() =>
    Math.floor(Math.random() * greetingImagePaths.length)
  )
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [extractedEvents, setExtractedEvents] = useState<any[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [isCalendarAuthenticated, setIsCalendarAuthenticated] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState<LoadingPhase[]>([{ message: 'Processing...' }])

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
    setExtractedEvents([])
    setLoadingConfig([...LOADING_PHASES.FILE_PROCESSING])

    try {
      // Step 1: Process the file (extract text or prepare for vision)
      const formData = new FormData()
      formData.append('file', file)

      const processResponse = await fetch('http://localhost:5000/api/process', {
        method: 'POST',
        body: formData,
      })

      if (!processResponse.ok) {
        const errorData = await processResponse.json()
        throw new Error(errorData.error || 'Failed to process file')
      }

      const processResult = await processResponse.json()

      // Step 2: Extract events from processed input
      setLoadingConfig([...LOADING_PHASES.EXTRACTING])

      const extractResponse = await fetch('http://localhost:5000/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: processResult.text || '',
          metadata: processResult.metadata || {},
        }),
      })

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json()
        throw new Error(errorData.error || 'Failed to extract events')
      }

      const extractResult = await extractResponse.json()

      if (extractResult.has_events) {
        setExtractedEvents(extractResult.events)

        // Step 3: Process each event through fact extraction and calendar formatting
        setLoadingConfig([{ message: 'Formatting calendar events...' }])

        const formattedEvents = []
        for (const event of extractResult.events) {
          // Extract facts
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

          // Format for calendar
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
          formattedEvents.push(calendarEvent)
        }

        setCalendarEvents(formattedEvents)

        // Success toast
        toast.success('Events Found!', {
          description: `Found ${extractResult.num_events} event${extractResult.num_events !== 1 ? 's' : ''} in ${file.name}`,
          duration: 4000,
        })
      } else {
        // Info toast (not an error, just no events found)
        toast.info('No Events Found', {
          description: 'The file doesn\'t appear to contain any calendar events.',
          duration: 4000,
        })
      }
    } catch (err) {
      let errorMessage = 'An error occurred'
      let errorTitle = 'Processing Failed'

      // Handle different error types
      if (err instanceof TypeError && err.message.includes('fetch')) {
        errorTitle = 'Connection Error'
        errorMessage = 'Could not connect to the server. Make sure the backend is running on http://localhost:5000'
      } else if (err instanceof Error) {
        errorMessage = err.message
      }

      // Error toast with specific messaging
      toast.error(errorTitle, {
        description: errorMessage,
        duration: 6000,
      })

      console.error('Processing error:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing])

  // Wrapper for file upload
  const handleFileUpload = useCallback((file: File) => {
    setUploadedFile(file)
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

    setUploadedFile(audioFile)
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
    setExtractedEvents([])
    setLoadingConfig([...LOADING_PHASES.TEXT_PROCESSING])

    try {
      // Extract events from text input
      const extractResponse = await fetch('http://localhost:5000/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          metadata: {},
        }),
      })

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json()
        throw new Error(errorData.error || 'Failed to extract events')
      }

      const extractResult = await extractResponse.json()

      if (extractResult.has_events) {
        setExtractedEvents(extractResult.events)

        // Process each event through fact extraction and calendar formatting
        setLoadingConfig([{ message: 'Formatting calendar events...' }])

        const formattedEvents = []
        for (const event of extractResult.events) {
          // Extract facts
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

          // Format for calendar
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
          formattedEvents.push(calendarEvent)
        }

        setCalendarEvents(formattedEvents)

        // Success toast
        toast.success('Events Found!', {
          description: `Found ${extractResult.num_events} event${extractResult.num_events !== 1 ? 's' : ''}`,
          duration: 4000,
        })
      } else {
        // Info toast (not an error, just no events found)
        toast.info('No Events Found', {
          description: 'The text doesn\'t appear to contain any calendar events.',
          duration: 4000,
        })
      }
    } catch (err) {
      let errorMessage = 'An error occurred'
      let errorTitle = 'Processing Failed'

      // Handle different error types
      if (err instanceof TypeError && err.message.includes('fetch')) {
        errorTitle = 'Connection Error'
        errorMessage = 'Could not connect to the server. Make sure the backend is running on http://localhost:5000'
      } else if (err instanceof Error) {
        errorMessage = err.message
      }

      // Error toast with specific messaging
      toast.error(errorTitle, {
        description: errorMessage,
        duration: 6000,
      })

      console.error('Processing error:', err)
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
  }, [])

  return (
    <div className="app">
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
      <div className="content">
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

        <MainInputArea
          uploadedFile={uploadedFile}
          isProcessing={isProcessing}
          loadingConfig={loadingConfig}
          onFileUpload={handleFileUpload}
          onAudioSubmit={handleAudioSubmit}
          onTextSubmit={handleTextSubmit}
          onClearFile={handleClearFile}
        />

        {/* Calendar Events Display */}
        {calendarEvents.length > 0 && (
          <EventConfirmation
            events={calendarEvents}
            onConfirm={() => {
              // TODO: Implement add to calendar functionality
              toast.success('Adding to calendar...', {
                description: 'This feature will be implemented soon!',
                duration: 3000,
              })
            }}
            onCancel={() => {
              setCalendarEvents([])
              setExtractedEvents([])
            }}
          />
        )}

        {/* Google Calendar Authentication */}
        <GoogleCalendarAuth onAuthChange={setIsCalendarAuthenticated} />
      </div>
    </div>
  )
}

export default App
