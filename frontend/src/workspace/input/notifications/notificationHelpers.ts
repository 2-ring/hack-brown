import { FileX, CheckCircle, Warning, Info } from '@phosphor-icons/react'
import type { Notification } from './types'

/**
 * Helper to create friendly error notifications from validation errors
 */
export function createValidationErrorNotification(error: string): Notification {
  // Convert technical error messages to friendly ones
  let friendlyMessage = error

  if (error.includes('not supported') || error.includes('File type')) {
    friendlyMessage = "Sorry, you can't upload that file type! Try something else."
  } else if (error.includes('too large')) {
    friendlyMessage = "Whoa, that file's too big! Try a smaller one."
  } else if (error.includes('empty')) {
    friendlyMessage = "This file seems to be empty. Pick a different one!"
  }

  return {
    id: `validation-error-${Date.now()}`,
    icon: FileX,
    iconWeight: 'duotone',
    message: friendlyMessage,
    variant: 'error',
    persistent: false,
    priority: 10,
  }
}

/**
 * Helper to create success notifications
 */
export function createSuccessNotification(message: string, ttl = 3000): Notification {
  return {
    id: `success-${Date.now()}`,
    icon: CheckCircle,
    iconWeight: 'duotone',
    message,
    variant: 'success',
    persistent: false,
    priority: 5,
    ttl,
  }
}

/**
 * Helper to create warning notifications
 */
export function createWarningNotification(message: string, ttl = 5000): Notification {
  return {
    id: `warning-${Date.now()}`,
    icon: Warning,
    iconWeight: 'duotone',
    message,
    variant: 'warning',
    persistent: false,
    priority: 7,
    ttl,
  }
}

/**
 * Helper to create info notifications
 */
export function createInfoNotification(message: string, persistent = false): Notification {
  return {
    id: `info-${Date.now()}`,
    icon: Info,
    iconWeight: 'duotone',
    message,
    variant: 'info',
    persistent,
    priority: 0,
  }
}

/**
 * Helper to create error notifications
 */
export function createErrorNotification(message: string): Notification {
  return {
    id: `error-${Date.now()}`,
    icon: FileX,
    iconWeight: 'duotone',
    message,
    variant: 'error',
    persistent: false,
    priority: 10,
  }
}

// Re-export from shared package
export { getFriendlyErrorMessage } from '@dropcal/shared'
