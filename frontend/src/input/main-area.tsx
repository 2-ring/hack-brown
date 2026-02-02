import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Images as ImagesIcon,
  Files as FileIcon,
  Microphone as MicrophoneIcon,
  Pen as TextIcon,
  ArrowFatUp as ArrowFatUpIcon
} from '@phosphor-icons/react'
import { AudioInput } from './audio'
import { TextInput } from './text'
import { FeedbackPill } from './feedback-pill'
import { LoadingState } from '../components/LoadingState'
import type { LoadingStateConfig, LoadingPhase } from '../types/loadingState'

interface MainInputAreaProps {
  uploadedFile: File | null
  isProcessing: boolean
  loadingConfig?: LoadingStateConfig | LoadingPhase[]
  feedbackMessage?: string
  onFileUpload: (file: File) => void
  onAudioSubmit: (audioBlob: Blob) => void
  onTextSubmit: (text: string) => void
  onClearFile: () => void
  onClearFeedback?: () => void
}

export function MainInputArea({
  uploadedFile,
  isProcessing,
  loadingConfig,
  feedbackMessage,
  onFileUpload,
  onAudioSubmit,
  onTextSubmit,
  onClearFile,
  onClearFeedback
}: MainInputAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTextInput, setIsTextInput] = useState(false)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isProcessing) {
      setIsDragging(true)
    }
  }, [isProcessing])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isProcessing) {
      setIsDragging(false)
    }
  }, [isProcessing])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isProcessing) return

    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      onFileUpload(files[0])
    }
  }, [onFileUpload, isProcessing])

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        onFileUpload(files[0])
      }
    }
    input.click()
  }, [onFileUpload])

  const handleDocumentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.pdf,.doc,.docx,.eml'
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        onFileUpload(files[0])
      }
    }
    input.click()
  }, [onFileUpload])

  const handleAudioClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRecording(true)
  }, [])

  const handleAudioFileUpload = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,.mp3,.wav,.m4a'
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        onFileUpload(files[0])
        setIsRecording(false)
      }
    }
    input.click()
  }, [onFileUpload])

  const handleAudioSubmit = useCallback((audioBlob: Blob) => {
    onAudioSubmit(audioBlob)
    setIsRecording(false)
  }, [onAudioSubmit])

  const handleTextClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsTextInput(true)
  }, [])

  const handleTextSubmit = useCallback((text: string) => {
    onTextSubmit(text)
    setIsTextInput(false)
  }, [onTextSubmit])

  const handleDropAreaClick = useCallback((e: React.MouseEvent) => {
    if (isProcessing) return

    // Only trigger file picker if clicking on the drop area background, not on buttons
    const target = e.target as HTMLElement
    if (target.classList.contains('drop-area') || target.classList.contains('icon-row')) {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*,.txt,.pdf,.eml,.mp3,.wav,.m4a'
      input.onchange = (e) => {
        const files = (e.target as HTMLInputElement).files
        if (files && files.length > 0) {
          onFileUpload(files[0])
        }
      }
      input.click()
    }
  }, [onFileUpload, isProcessing])

  return (
    <motion.div
      className={`drop-area ${isDragging ? 'dragging' : ''} ${isProcessing ? 'processing' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      onDragEnter={!isProcessing ? handleDragEnter : undefined}
      onDragLeave={!isProcessing ? handleDragLeave : undefined}
      onDragOver={!isProcessing ? handleDragOver : undefined}
      onDrop={!isProcessing ? handleDrop : undefined}
      onClick={!isProcessing ? handleDropAreaClick : undefined}
      style={{ pointerEvents: isProcessing ? 'none' : 'auto' }}
    >
      {isRecording ? (
        <AudioInput
          onClose={() => setIsRecording(false)}
          onSubmit={handleAudioSubmit}
          onUploadFile={handleAudioFileUpload}
        />
      ) : isTextInput ? (
        <TextInput
          onClose={() => setIsTextInput(false)}
          onSubmit={handleTextSubmit}
        />
      ) : feedbackMessage ? (
        <FeedbackPill
          message={feedbackMessage}
          onClose={() => onClearFeedback?.()}
        />
      ) : isProcessing ? (
        <LoadingState
          config={loadingConfig || { message: 'Processing...' }}
          isLoading={isProcessing}
        />
      ) : uploadedFile ? (
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
        <div className="icon-row">
          <AnimatePresence>
            {!isDragging && (
              <motion.div
                key="image-button"
                className="icon-circle small clickable"
                initial={{ opacity: 0, x: 20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.8 }}
                transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
                onClick={handleImageClick}
                title="Upload Image"
              >
                <ImagesIcon size={24} weight="regular" />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {!isDragging && (
              <motion.div
                key="document-button"
                className="icon-circle small clickable"
                initial={{ opacity: 0, x: 10, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.8 }}
                transition={{ duration: 0.2, ease: "easeOut", delay: 0.1 }}
                onClick={handleDocumentClick}
                title="Upload Document"
              >
                <FileIcon size={24} weight="regular" />
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div
            className="icon-circle center"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {isDragging ? (
              <ArrowFatUpIcon size={32} weight="fill" />
            ) : (
              <ArrowFatUpIcon size={32} weight="bold" />
            )}
          </motion.div>
          <AnimatePresence>
            {!isDragging && (
              <motion.div
                key="audio-button"
                className="icon-circle small clickable"
                initial={{ opacity: 0, x: -10, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.8 }}
                transition={{ duration: 0.2, ease: "easeOut", delay: 0.1 }}
                onClick={handleAudioClick}
                title="Record Audio"
              >
                <MicrophoneIcon size={24} weight="regular" />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {!isDragging && (
              <motion.div
                key="text-button"
                className="icon-circle small clickable"
                initial={{ opacity: 0, x: -20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.8 }}
                transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
                onClick={handleTextClick}
                title="Text Input"
              >
                <TextIcon size={24} weight="regular" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}
