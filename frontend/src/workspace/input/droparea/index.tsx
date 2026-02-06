import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ButtonMenu } from './content/ButtonMenu'
import { Audio } from './content/Audio'
import { Text } from './content/Text'
import { Link } from './content/Link'
import { Email } from './content/Email'

interface DropAreaProps {
  uploadedFile: File | null
  isProcessing: boolean
  onFileUpload: (file: File) => void
  onAudioSubmit: (audioBlob: Blob) => void
  onTextSubmit: (text: string) => void
  onClearFile: () => void
}

export function DropArea({
  uploadedFile,
  isProcessing,
  onFileUpload,
  onAudioSubmit,
  onTextSubmit,
  onClearFile,
}: DropAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTextInput, setIsTextInput] = useState(false)
  const [isLinkInput, setIsLinkInput] = useState(false)
  const [isEmailInput, setIsEmailInput] = useState(false)

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

  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsLinkInput(true)
  }, [])

  const handleLinkSubmit = useCallback((content: string) => {
    onTextSubmit(content)
    setIsLinkInput(false)
  }, [onTextSubmit])

  const handleEmailClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEmailInput(true)
  }, [])

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
        <Audio
          onClose={() => setIsRecording(false)}
          onSubmit={handleAudioSubmit}
          onUploadFile={handleAudioFileUpload}
        />
      ) : isTextInput ? (
        <Text
          onClose={() => setIsTextInput(false)}
          onSubmit={handleTextSubmit}
        />
      ) : isLinkInput ? (
        <Link
          onClose={() => setIsLinkInput(false)}
          onSubmit={handleLinkSubmit}
        />
      ) : isEmailInput ? (
        <Email
          onClose={() => setIsEmailInput(false)}
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
        <ButtonMenu
          isDragging={isDragging}
          onImageClick={handleImageClick}
          onDocumentClick={handleDocumentClick}
          onAudioClick={handleAudioClick}
          onTextClick={handleTextClick}
          onLinkClick={handleLinkClick}
          onEmailClick={handleEmailClick}
        />
      )}
    </motion.div>
  )
}
