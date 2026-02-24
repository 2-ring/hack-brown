export type ActiveInput = 'audio' | 'text' | 'link' | 'email' | null

export interface BaseInputWorkspaceProps {
  uploadedFile: File | null
  isProcessing: boolean
  onFileUpload: (file: File) => void
  onAudioSubmit: (audioBlob: Blob) => void
  onTextSubmit: (text: string) => void
  onClearFile: () => void
}
