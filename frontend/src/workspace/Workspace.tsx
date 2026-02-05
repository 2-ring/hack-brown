import { motion } from 'framer-motion'
import { List as MenuIcon, PlusCircle } from '@phosphor-icons/react'
import { InputWorkspace } from './input'
import { EventsWorkspace } from './events/EventsWorkspace'
import type { CalendarEvent } from './events/types'
import type { LoadingStateConfig } from './events/types'
import { getGreeting } from '../utils/greetings'
import { useAuth } from '../auth/AuthContext'
import mark from '../assets/brand/light/mark.png'

type AppState = 'input' | 'loading' | 'review'

interface WorkspaceProps {
  // State
  appState: AppState

  // Input state props
  uploadedFile: File | null
  isProcessing: boolean
  loadingConfig?: LoadingStateConfig | LoadingStateConfig[]
  feedbackMessage?: string
  greetingImage?: string
  isGuestMode?: boolean

  // Events state props
  calendarEvents: (CalendarEvent | null)[]
  expectedEventCount?: number

  // Handlers
  onFileUpload: (file: File) => void
  onAudioSubmit: (audioBlob: Blob) => void
  onTextSubmit: (text: string) => void
  onClearFile: () => void
  onClearFeedback?: () => void
  onConfirm?: () => void
  onMenuToggle?: () => void
  onNewSession?: () => void
}

export function Workspace({
  appState,
  uploadedFile,
  isProcessing,
  loadingConfig,
  feedbackMessage,
  greetingImage,
  isGuestMode,
  calendarEvents,
  expectedEventCount,
  onFileUpload,
  onAudioSubmit,
  onTextSubmit,
  onClearFile,
  onClearFeedback,
  onConfirm,
  onMenuToggle,
  onNewSession,
}: WorkspaceProps) {
  const { user } = useAuth()
  const greeting = getGreeting(user?.name)

  return (
    <>
      {/* Mobile Header - only show in input state */}
      {appState === 'input' && (
        <div className="mobile-input-header">
          <button className="mobile-header-button" onClick={onMenuToggle} title="Menu">
            <MenuIcon size={24} weight="regular" />
          </button>
          <button className="mobile-header-button new-event" onClick={onNewSession} title="New event">
            <PlusCircle size={24} weight="regular" />
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
            <img
              src={mark}
              alt="DropCal"
              className="greeting-logo"
            />
            <h1 className="greeting-text">{greeting}</h1>
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
          onConfirm={onConfirm}
        />
      )}
    </>
  )
}
