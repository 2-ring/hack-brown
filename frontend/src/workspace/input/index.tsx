import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { HandWaving, Warning } from '@phosphor-icons/react'
import { DropArea } from './droparea'
import { NotificationBar, useNotificationQueue } from './notifications'

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
  const {
    currentNotification,
    addNotification,
    dismissNotification,
  } = useNotificationQueue()

  // Add guest mode notification (persistent)
  useEffect(() => {
    if (isGuestMode) {
      addNotification({
        id: 'guest-mode',
        icon: HandWaving,
        iconWeight: 'duotone',
        message: 'Hey! Welcome to dropcal. Keep in mind you need an account to sync your calender.',
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

  return (
    <>
      <DropArea
        uploadedFile={uploadedFile}
        isProcessing={isProcessing}
        onFileUpload={onFileUpload}
        onAudioSubmit={onAudioSubmit}
        onTextSubmit={onTextSubmit}
        onClearFile={onClearFile}
      />
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
  )
}
