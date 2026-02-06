import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MobileButtonMenu } from './MobileButtonMenu'
import { useInputHandlers } from '../shared/hooks'
import { Audio, Text, Link, Email } from '../shared/components'
import type { BaseInputWorkspaceProps } from '../shared/types'

type ActiveInput = 'audio' | 'text' | 'link' | 'email' | null

export function MobileInputWorkspace({
  uploadedFile,
  isProcessing,
  onFileUpload,
  onAudioSubmit,
  onTextSubmit,
  onClearFile,
}: BaseInputWorkspaceProps) {
  // Single source of truth: only one input can be active at a time
  const [activeInput, setActiveInput] = useState<ActiveInput>(null)

  const { handleImageClick, handleDocumentClick, handleAudioFileUpload } = useInputHandlers({
    onFileUpload
  })

  const handleAudioClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveInput('audio')
  }, [])

  const handleAudioSubmit = useCallback((audioBlob: Blob) => {
    onAudioSubmit(audioBlob)
    setActiveInput(null)
  }, [onAudioSubmit])

  const handleTextClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveInput('text')
  }, [])

  const handleTextSubmit = useCallback((text: string) => {
    onTextSubmit(text)
    setActiveInput(null)
  }, [onTextSubmit])

  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveInput('link')
  }, [])

  const handleLinkSubmit = useCallback((content: string) => {
    onTextSubmit(content)
    setActiveInput(null)
  }, [onTextSubmit])

  const handleEmailClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveInput('email')
  }, [])

  const handleCloseInput = useCallback(() => {
    setActiveInput(null)
  }, [])

  return (
    <>
      {/* Button Menu - No drop area, just buttons */}
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
            onImageClick={handleImageClick}
            onDocumentClick={handleDocumentClick}
            onAudioClick={handleAudioClick}
            onTextClick={handleTextClick}
            onLinkClick={handleLinkClick}
            onEmailClick={handleEmailClick}
            activeButton={activeInput}
          />
        )}
      </div>

      {/* Input Components - Absolute bottom of screen */}
      <AnimatePresence mode="wait">
        {activeInput === 'audio' && (
          <motion.div
            key="audio-input"
            className="mobile-input-absolute-bottom"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Audio
              onClose={handleCloseInput}
              onSubmit={handleAudioSubmit}
              onUploadFile={handleAudioFileUpload}
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
            />
          </motion.div>
        )}

        {activeInput === 'link' && (
          <motion.div
            key="link-input"
            className="mobile-input-absolute-bottom"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Link
              onClose={handleCloseInput}
              onSubmit={handleLinkSubmit}
            />
          </motion.div>
        )}

        {activeInput === 'email' && (
          <motion.div
            key="email-input"
            className="mobile-input-absolute-bottom"
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
    </>
  )
}
