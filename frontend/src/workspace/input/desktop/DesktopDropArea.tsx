import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { DesktopButtonMenu } from './DesktopButtonMenu'
import { useInputHandlers } from '../shared/hooks'
import { Audio, Text, Link, Email } from '../shared/components'
import type { BaseInputWorkspaceProps } from '../shared/types'

export function DesktopDropArea({
  uploadedFile,
  isProcessing,
  onFileUpload,
  onAudioSubmit,
  onTextSubmit,
  onClearFile,
}: BaseInputWorkspaceProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTextInput, setIsTextInput] = useState(false)
  const [isLinkInput, setIsLinkInput] = useState(false)
  const [isEmailInput, setIsEmailInput] = useState(false)
  const dragCounterRef = useRef(0)
  const [searchParams, setSearchParams] = useSearchParams()

  const { handleImageClick, handleDocumentClick, handleAudioFileUpload } = useInputHandlers({
    onFileUpload
  })

  // Open a specific input mode from ?input= query param (used by browser extension).
  // Only handles overlay inputs — file-picker modes (image, document, upload) just
  // navigate to the site where the user can click the button directly.
  useEffect(() => {
    const inputParam = searchParams.get('input')
    if (!inputParam || isProcessing) return

    searchParams.delete('input')
    setSearchParams(searchParams, { replace: true })

    switch (inputParam) {
      case 'link':
        setIsLinkInput(true)
        break
      case 'text':
        setIsTextInput(true)
        break
      case 'audio':
        setIsRecording(true)
        break
      case 'email':
        setIsEmailInput(true)
        break
    }
  }, [searchParams])

  // Global paste handler: Ctrl+V anywhere on the page routes content into the drop area
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isProcessing) return

      // Don't intercept paste inside input fields or textareas
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) {
        return
      }

      const clipboardData = e.clipboardData
      if (!clipboardData) return

      // Check for pasted files (images, documents, etc.)
      if (clipboardData.files && clipboardData.files.length > 0) {
        e.preventDefault()
        onFileUpload(clipboardData.files[0])
        return
      }

      // Check for pasted text
      const text = clipboardData.getData('text/plain')
      if (text && text.trim()) {
        e.preventDefault()
        onTextSubmit(text.trim())
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [isProcessing, onFileUpload, onTextSubmit])

  // Global drag listeners on the document so dragging a file ANYWHERE on screen
  // immediately transitions to the drop UI. A counter tracks nested dragenter/
  // dragleave pairs (fired when crossing child element boundaries) so the state
  // stays stable instead of flickering.
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      if (isProcessing) return
      // Only react to file drags, not internal element drags
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounterRef.current++
        if (dragCounterRef.current === 1) {
          setIsDragging(true)
        }
      }
    }

    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
    }

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault()
      if (isProcessing) return
      dragCounterRef.current--
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setIsDragging(false)
      }
    }

    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsDragging(false)

      if (isProcessing) return

      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        onFileUpload(files[0])
      }
    }

    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)

    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [isProcessing, onFileUpload])

  const handleAudioClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRecording(true)
  }, [])

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
      input.accept = 'image/*,.txt,.md,.pdf,.eml,.mp3,.wav,.m4a,.docx,.pptx,.xlsx,.html,.csv,.epub,.rtf'
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
        <DesktopButtonMenu
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
