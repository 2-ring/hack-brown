import { useCallback } from 'react'
import { isNativePlatform } from '../../../../utils/platform'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

export interface InputHandlers {
  handleImageClick: (e: React.MouseEvent) => void
  handleDocumentClick: (e: React.MouseEvent) => void
  handleAudioFileUpload: () => void
}

interface UseInputHandlersProps {
  onFileUpload: (file: File) => void
  onRecordingStart?: () => void
}

/**
 * Convert a base64 data URI to a File object.
 */
function dataUriToFile(dataUri: string, filename: string): File {
  const [header, base64] = dataUri.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new File([bytes], filename, { type: mime })
}

export function useInputHandlers({
  onFileUpload,
  onRecordingStart
}: UseInputHandlersProps): InputHandlers {
  const handleImageClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (isNativePlatform()) {
      try {
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt, // Let user choose camera or photo library
          quality: 90,
        })
        if (photo.dataUrl) {
          const file = dataUriToFile(photo.dataUrl, `photo.${photo.format || 'jpeg'}`)
          onFileUpload(file)
        }
      } catch {
        // User cancelled — do nothing
      }
      return
    }

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
    input.accept = '.txt,.md,.pdf,.eml,.docx,.pptx,.xlsx,.html,.csv,.epub,.rtf'
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
