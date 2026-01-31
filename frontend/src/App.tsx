import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { validateFile } from './utils/fileValidation'
import { MainInputArea } from './input/main-area'
import { GoogleCalendarAuth } from './components/GoogleCalendarAuth'
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
  const [isCalendarAuthenticated, setIsCalendarAuthenticated] = useState(false)

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

    // Show loading toast
    const loadingToast = toast.loading('Processing file...', {
      description: `Analyzing ${file.name}`,
    })

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
      toast.loading('Extracting events...', {
        id: loadingToast,
        description: 'Analyzing calendar information',
      })

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

        // Success toast
        toast.success('Events Found!', {
          id: loadingToast,
          description: `Found ${extractResult.num_events} event${extractResult.num_events !== 1 ? 's' : ''} in ${file.name}`,
          duration: 4000,
        })
      } else {
        // Info toast (not an error, just no events found)
        toast.info('No Events Found', {
          id: loadingToast,
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
        id: loadingToast,
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

    // Show loading toast
    const loadingToast = toast.loading('Processing text...', {
      description: 'Analyzing calendar information',
    })

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

        // Success toast
        toast.success('Events Found!', {
          id: loadingToast,
          description: `Found ${extractResult.num_events} event${extractResult.num_events !== 1 ? 's' : ''}`,
          duration: 4000,
        })
      } else {
        // Info toast (not an error, just no events found)
        toast.info('No Events Found', {
          id: loadingToast,
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
        id: loadingToast,
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
          onFileUpload={handleFileUpload}
          onAudioSubmit={handleAudioSubmit}
          onTextSubmit={handleTextSubmit}
          onClearFile={handleClearFile}
        />

        {/* Extracted Events Display */}
        {extractedEvents.length > 0 && (
          <motion.div
            className="events-container"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2>Found {extractedEvents.length} Event{extractedEvents.length !== 1 ? 's' : ''}</h2>
            {extractedEvents.map((event, index) => (
              <div key={index} className="event-card">
                <h3>{event.description}</h3>
                <p><strong>Confidence:</strong> {event.confidence}</p>
                <div style={{ marginTop: '10px' }}>
                  <strong>Raw Text:</strong>
                  {event.raw_text.map((text: string, i: number) => (
                    <p key={i} style={{ marginLeft: '10px', fontStyle: 'italic' }}>
                      {text}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Google Calendar Authentication */}
        <GoogleCalendarAuth onAuthChange={setIsCalendarAuthenticated} />
      </div>
    </div>
  )
}

export default App
