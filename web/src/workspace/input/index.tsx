import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { HandWaving, Warning } from '@phosphor-icons/react'
import { DesktopInputWorkspace } from './desktop/DesktopInputWorkspace'
import { MobileInputWorkspace } from './mobile/MobileInputWorkspace'
import { NotificationBar, useNotifications } from './notifications'
import { useViewport } from './shared/hooks'
import './desktop/styles/desktop.css'
import './mobile/styles/mobile.css'

interface InputWorkspaceProps {
  uploadedFile: File | null
  isProcessing: boolean
  feedbackMessage?: string
  isGuestMode?: boolean
  onFileUpload: (file: File) => void
  onAudioSubmit: (audioBlob: Blob) => void
  onTextSubmit: (text: string) => void
  onClearFile: () => void
  onClearFeedback?: () => void
}

export function InputWorkspace({
  uploadedFile,
  isProcessing,
  feedbackMessage,
  isGuestMode,
  onFileUpload,
  onAudioSubmit,
  onTextSubmit,
  onClearFile,
  onClearFeedback
}: InputWorkspaceProps) {
  const { isMobile } = useViewport()
  const {
    currentNotification,
    addNotification,
    dismissNotification,
  } = useNotifications()

  // Add guest mode notification (persistent)
  useEffect(() => {
    if (isGuestMode) {
      addNotification({
        id: 'guest-mode',
        icon: HandWaving,
        iconWeight: 'duotone',
        message: 'Hey! Welcome to DropCal. Keep in mind you need an account to sync your calendar.',
        variant: 'info',
        persistent: true,
        priority: -1, // Low priority, shows when no other notifications
      })
    }
  }, [isGuestMode, addNotification])

  // Add feedback message notification (temporary)
  useEffect(() => {
    if (feedbackMessage) {
      addNotification({
        id: 'feedback',
        icon: Warning,
        iconWeight: 'duotone',
        message: feedbackMessage,
        variant: 'warning',
        persistent: false,
        priority: 10, // High priority
      })
    }
  }, [feedbackMessage, addNotification])

  const handleNotificationDismiss = (id: string) => {
    dismissNotification(id)
    if (id === 'feedback') {
      onClearFeedback?.()
    }
  }

  const inputProps = {
    uploadedFile,
    isProcessing,
    onFileUpload,
    onAudioSubmit,
    onTextSubmit,
    onClearFile
  }

  return (
    <>
      {isMobile ? (
        <MobileInputWorkspace
          {...inputProps}
          notification={currentNotification}
          onDismissNotification={handleNotificationDismiss}
        />
      ) : (
        <>
          <DesktopInputWorkspace {...inputProps} />
          <div className="desktop-legal-links" style={{ position: 'fixed', bottom: 4, left: 8 }}>
            <a href="/privacy">Privacy Policy</a>
            <span>·</span>
            <a href="/terms">Terms of Service</a>
          </div>
          <AnimatePresence mode="wait">
            {currentNotification && (
              <NotificationBar
                key={currentNotification.id}
                notification={currentNotification}
                onDismiss={handleNotificationDismiss}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </>
  )
}
