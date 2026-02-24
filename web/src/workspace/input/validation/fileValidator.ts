/**
 * File Validation Utility
 * Lightweight client-side guard — the backend is the source of truth
 * for supported types and per-type size limits.
 */

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB (matches Flask MAX_CONTENT_LENGTH)

export interface ValidationResult {
  valid: boolean
  error?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * Quick client-side check before uploading.
 * Rejects empty and oversized files; everything else is validated server-side.
 */
export function validateFile(file: File): ValidationResult {
  if (file.size === 0) {
    return { valid: false, error: 'File is empty.' }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      error: `File is too large (${formatFileSize(file.size)}). Maximum upload size is ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
    }
  }

  return { valid: true }
}
