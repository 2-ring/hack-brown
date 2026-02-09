/**
 * File Validation Utility
 * Centralized, intelligent file validation with detailed error messages
 */

export interface ValidationResult {
  valid: boolean
  error?: string
  fileType?: 'image' | 'audio' | 'pdf' | 'text' | 'email' | 'unknown'
}

// Supported file types with their extensions and MIME types
const FILE_TYPES = {
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],
    maxSize: 20 * 1024 * 1024, // 20MB
    label: 'Image'
  },
  audio: {
    extensions: ['.mp3', '.wav', '.m4a', '.webm', '.ogg', '.mpeg', '.mpga', '.flac'],
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/flac'],
    maxSize: 25 * 1024 * 1024, // 25MB
    label: 'Audio'
  },
  pdf: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    maxSize: 20 * 1024 * 1024, // 20MB
    label: 'PDF'
  },
  text: {
    extensions: ['.txt', '.text', '.md', '.markdown'],
    mimeTypes: ['text/plain', 'text/markdown'],
    maxSize: 10 * 1024 * 1024, // 10MB
    label: 'Text'
  },
  email: {
    extensions: ['.eml', '.email'],
    mimeTypes: ['message/rfc822'],
    maxSize: 10 * 1024 * 1024, // 10MB
    label: 'Email'
  }
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  return filename.toLowerCase().substring(filename.lastIndexOf('.')).toLowerCase()
}

/**
 * Detect file type based on extension and MIME type
 */
function detectFileType(file: File): 'image' | 'audio' | 'pdf' | 'text' | 'email' | 'unknown' {
  const extension = getFileExtension(file.name)
  const mimeType = file.type.toLowerCase()

  for (const [type, config] of Object.entries(FILE_TYPES)) {
    if (
      config.extensions.includes(extension) ||
      config.mimeTypes.some(mime => mimeType.startsWith(mime))
    ) {
      return type as any
    }
  }

  return 'unknown'
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * Get all supported extensions as a readable string
 */
export function getSupportedExtensions(): string {
  const allExtensions = Object.values(FILE_TYPES).flatMap(config => config.extensions)
  return allExtensions.join(', ')
}

/**
 * Validate a file before upload
 * Returns detailed validation result with specific error messages
 */
export function validateFile(file: File): ValidationResult {
  // Detect file type
  const fileType = detectFileType(file)

  // Check if file type is supported
  if (fileType === 'unknown') {
    const extension = getFileExtension(file.name)
    return {
      valid: false,
      error: `File type "${extension || 'unknown'}" is not supported. Supported types: ${getSupportedExtensions()}`,
      fileType: 'unknown'
    }
  }

  const config = FILE_TYPES[fileType]

  // Check file size
  if (file.size > config.maxSize) {
    return {
      valid: false,
      error: `${config.label} file is too large. Maximum size: ${formatFileSize(config.maxSize)}. Your file: ${formatFileSize(file.size)}`,
      fileType
    }
  }

  // Check if file is empty
  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty. Please select a valid file.',
      fileType
    }
  }

  // All validations passed
  return {
    valid: true,
    fileType
  }
}

/**
 * Validate multiple files (for future batch upload support)
 */
export function validateFiles(files: File[]): ValidationResult[] {
  return files.map(validateFile)
}
