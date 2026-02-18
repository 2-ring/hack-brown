import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar, CalendarStar } from '@phosphor-icons/react'
import { InputWorkspace } from './input'
import { EventsWorkspace } from './events/EventsWorkspace'
import type { CalendarEvent } from './events/types'
import type { LoadingStateConfig } from './events/types'
import type { SyncCalendar } from '../api/sync'
import { getGreeting } from '../utils/greetings'
import { useAuth } from '../auth/AuthContext'
import { Logo } from '../components/Logo'

type AppState = 'input' | 'loading' | 'review'

interface WorkspaceProps {
  // State
  appState: AppState

  // Input state props
  uploadedFile: File | null
  isProcessing: boolean
  loadingConfig?: LoadingStateConfig | LoadingStateConfig[]
  feedbackMessage?: string
  isGuestMode?: boolean

  // Events state props
  calendarEvents: (CalendarEvent | null)[]
  calendars?: SyncCalendar[]
  expectedEventCount?: number
  inputType?: 'text' | 'image' | 'audio' | 'document' | 'pdf' | 'email'
  inputContent?: string

  // Handlers
  onFileUpload: (file: File) => void
  onAudioSubmit: (audioBlob: Blob) => void
  onTextSubmit: (text: string) => void
  onClearFile: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onConfirm?: (editedEvents?: CalendarEvent[]) => Promise<any> | any
  onEventDeleted?: (eventId: string, sessionId?: string, remainingCount?: number) => void
  onEventsChanged?: (events: CalendarEvent[]) => void
  onMenuToggle?: () => void
  onNewSession?: () => void
  onAuthRequired?: () => void
  sessionId?: string
}

export function Workspace({
  appState,
  uploadedFile,
  isProcessing,
  loadingConfig,
  feedbackMessage,
  isGuestMode,
  calendarEvents,
  calendars,
  expectedEventCount,
  inputType,
  inputContent,
  onFileUpload,
  onAudioSubmit,
  onTextSubmit,
  onClearFile,
  onConfirm,
  onEventDeleted,
  onEventsChanged,
  onMenuToggle,
  onNewSession,
  onAuthRequired,
  sessionId,
}: WorkspaceProps) {
  const { user } = useAuth()
  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name
  const firstName = fullName?.split(' ')[0]
  const greeting = getGreeting(firstName)

  return (
    <>
      {/* Mobile Header - only show in input state */}
      {appState === 'input' && (
        <div className="mobile-input-header">
          <button className="mobile-header-button" onClick={onMenuToggle} title="Menu">
            <Sidebar size={24} weight="duotone" />
          </button>
          <button className="mobile-header-button new-event" onClick={onNewSession} title="New event">
            <CalendarStar size={24} weight="duotone" />
          </button>
        </div>
      )}

      {/* Input State */}
      {appState === 'input' && (
        <motion.div
          className="input-state-container"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="greeting-row">
            <Logo
              size={48}
              className="greeting-logo"
            />
            <AnimatePresence mode="wait">
              <motion.h1
                key={greeting}
                className="display-text greeting-text"
                initial={{ rotateX: 90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                exit={{ rotateX: -90, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformPerspective: 1000 }}
              >
                {greeting}
              </motion.h1>
            </AnimatePresence>
          </div>

          <InputWorkspace
            uploadedFile={uploadedFile}
            isProcessing={isProcessing}
            feedbackMessage={feedbackMessage}
            isGuestMode={isGuestMode}
            onFileUpload={onFileUpload}
            onAudioSubmit={onAudioSubmit}
            onTextSubmit={onTextSubmit}
            onClearFile={onClearFile}
            onClearFeedback={() => {}} // Handled by notification system
          />
        </motion.div>
      )}

      {/* Events State (loading or review) */}
      {(appState === 'loading' || appState === 'review') && (
        <EventsWorkspace
          events={calendarEvents}
          isLoading={appState === 'loading'}
          loadingConfig={Array.isArray(loadingConfig) ? loadingConfig : loadingConfig ? [loadingConfig] : []}
          expectedEventCount={expectedEventCount}
          inputType={inputType}
          inputContent={inputContent}
          onConfirm={onConfirm}
          onEventDeleted={onEventDeleted}
          onEventsChanged={onEventsChanged}
          onBack={onMenuToggle}
          onAuthRequired={onAuthRequired}
          sessionId={sessionId}
          calendars={calendars}
        />
      )}
    </>
  )
}
