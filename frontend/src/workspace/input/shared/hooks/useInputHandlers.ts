import { useCallback } from 'react'

export interface InputHandlers {
  handleImageClick: (e: React.MouseEvent) => void
  handleDocumentClick: (e: React.MouseEvent) => void
  handleAudioFileUpload: () => void
}

interface UseInputHandlersProps {
  onFileUpload: (file: File) => void
  onRecordingStart?: () => void
}

export function useInputHandlers({
  onFileUpload,
  onRecordingStart
}: UseInputHandlersProps): InputHandlers {
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
    input.accept = '.txt,.md,.pdf,.eml'
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        onFileUpload(files[0])
      }
    }
    input.click()
  }, [onFileUpload])

  const handleAudioFileUpload = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,.mp3,.wav,.m4a'
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        onFileUpload(files[0])
        onRecordingStart?.()
      }
    }
    input.click()
  }, [onFileUpload, onRecordingStart])

  return {
    handleImageClick,
    handleDocumentClick,
    handleAudioFileUpload
  }
}
