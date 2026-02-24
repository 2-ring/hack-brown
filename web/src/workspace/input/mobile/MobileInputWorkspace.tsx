import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MobileButtonMenu } from './MobileButtonMenu'
import { useInputHandlers } from '../shared/hooks'
import { Audio, Text, Link, Email } from '../shared/components'
import { NotificationBar } from '../notifications'
import type { Notification } from '../notifications/types'
import type { ActiveInput, BaseInputWorkspaceProps } from '../shared/types'

interface MobileInputWorkspaceProps extends BaseInputWorkspaceProps {
  notification?: Notification | null
  onDismissNotification?: (id: string) => void
}

export function MobileInputWorkspace({
  uploadedFile,
  isProcessing,
  onFileUpload,
  onAudioSubmit,
  onTextSubmit,
  onClearFile,
  notification,
  onDismissNotification,
}: MobileInputWorkspaceProps) {
  // Single source of truth — drives button highlighting AND which input is shown
  const [activeInput, setActiveInput] = useState<ActiveInput>(null)
  const activeInputRef = useRef<ActiveInput>(null)
  activeInputRef.current = activeInput
  // Each input component registers its submit here; center button calls it
  const submitRef = useRef<(() => void) | null>(null)

  const { handleImageClick: rawImageClick, handleDocumentClick: rawDocumentClick, handleAudioFileUpload } = useInputHandlers({
    onFileUpload
  })

  // Wrap file-upload handlers so they close the active input first
  const handleImageClick = useCallback((e: React.MouseEvent) => {
    setActiveInput(null)
    rawImageClick(e)
  }, [rawImageClick])

  const handleDocumentClick = useCallback((e: React.MouseEvent) => {
    setActiveInput(null)
    rawDocumentClick(e)
  }, [rawDocumentClick])

  // One callback for all input-type buttons
  const handleSelect = useCallback((input: ActiveInput) => {
    setActiveInput(input)
  }, [])

  // Center button triggers whichever input is active
  const handleSubmit = useCallback(() => {
    submitRef.current?.()
  }, [])

  // After a successful submit, clear the active input
  // Guard: only submit if audio is still active (prevents stale blob during exit animation)
  const handleAudioSubmit = useCallback((audioBlob: Blob) => {
    if (activeInputRef.current !== 'audio') return
    onAudioSubmit(audioBlob)
    setActiveInput(null)
  }, [onAudioSubmit])

  const handleTextSubmit = useCallback((text: string) => {
    onTextSubmit(text)
    setActiveInput(null)
  }, [onTextSubmit])

  const handleLinkSubmit = useCallback((content: string) => {
    onTextSubmit(content)
    setActiveInput(null)
  }, [onTextSubmit])

  const handleCloseInput = useCallback(() => {
    setActiveInput(null)
  }, [])

  return (
    <>
      {/* Button Menu */}
      <div style={{ pointerEvents: isProcessing ? 'none' : 'auto', opacity: isProcessing ? 0.5 : 1 }}>
        {uploadedFile ? (
          <div className="file-info">
            <p className="file-name">{uploadedFile.name}</p>
            <p className="file-size">
              {(uploadedFile.size / 1024).toFixed(2)} KB
            </p>
            <button
              className="clear-button"
              onClick={onClearFile}
            >
              Clear
            </button>
          </div>
        ) : (
          <MobileButtonMenu
            activeInput={activeInput}
            onSelect={handleSelect}
            onSubmit={handleSubmit}
            onImageClick={handleImageClick}
            onDocumentClick={handleDocumentClick}
          />
        )}
      </div>

      {/* Fixed bottom stack: notification on top, active input on bottom */}
      <div className="mobile-bottom-stack">
        <AnimatePresence mode="wait">
          {notification && onDismissNotification && (
            <NotificationBar
              key={notification.id}
              notification={notification}
              onDismiss={onDismissNotification}
            />
          )}
        </AnimatePresence>

        {/* Active input — exactly one at a time, driven by activeInput */}
        <AnimatePresence mode="wait">
          {activeInput === 'audio' && (
            <motion.div
              key="audio-input"
              className="mobile-input-absolute-bottom mobile-audio-input"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Audio
                onClose={() => setActiveInput('text')}
                onSubmit={handleAudioSubmit}
                onUploadFile={handleAudioFileUpload}
                submitRef={submitRef}
              />
            </motion.div>
          )}

          {activeInput === 'text' && (
            <motion.div
              key="text-input"
              className="mobile-input-absolute-bottom"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Text
                onClose={handleCloseInput}
                onSubmit={handleTextSubmit}
                submitRef={submitRef}
              />
            </motion.div>
          )}

          {activeInput === 'link' && (
            <motion.div
              key="link-input"
              className="mobile-input-absolute-bottom mobile-link-input"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Link
                onClose={handleCloseInput}
                onSubmit={handleLinkSubmit}
                submitRef={submitRef}
              />
            </motion.div>
          )}

          {activeInput === 'email' && (
            <motion.div
              key="email-input"
              className="mobile-input-absolute-bottom mobile-email-input"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Email
                onClose={handleCloseInput}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
