/**
 * Backend API client for DropCal.
 *
 * Creates a shared API client with platform-specific config (Vite env, Supabase auth,
 * localStorage guest tokens), then re-exports all methods so existing import paths
 * continue to work unchanged.
 *
 * Platform-specific functions (streamSession, File-based uploads) are defined locally.
 */

import { createApiClient } from '@dropcal/shared';
import type { ConflictInfo } from '@dropcal/shared';
import type { CalendarEvent } from '../workspace/events/types';
import type { Session } from './types';
import { getAccessToken } from '../auth/supabase';
import { GuestSessionManager } from '../auth/GuestSessionManager';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const client = createApiClient({
  baseUrl: API_URL,
  getAccessToken,
  getGuestAccessToken: (sessionId: string) => GuestSessionManager.getAccessToken(sessionId),
});

// Re-export all shared client methods
export const {
  createTextSession,
  getSession,
  getUserSessions,
  pollSession,
  healthCheck,
  syncUserProfile,
  getUserProfile,
  updateUserProfile,
  updateUserPreferences,
  storeGoogleCalendarTokens,
  pushEvents,
  syncSessionInbound,
  getSessionEvents,
  updateEvent,
  deleteEvent,
  applyModifications,
  checkEventConflicts,
  sendMicrosoftTokens,
  sendAppleCredentials,
  getCalendarProviders,
  setPrimaryCalendarProvider,
  disconnectCalendarProvider,
  getUserPreferences,
  deleteAccount,
  createCheckoutSession,
  createPortalSession,
  getBillingStatus,
  createGuestTextSession,
  getGuestSession,
  migrateGuestSessions,
} = client;

// Re-export types
export type { ConflictInfo };

// ============================================================================
// Platform-specific: File uploads (wraps DOM File → FormData)
// ============================================================================

/**
 * Upload a file and create a session. Backend auto-detects file type.
 */
export async function uploadFile(
  file: File,
): Promise<{ session: Session; file_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return client.uploadFile(formData);
}

/**
 * Upload file as guest (no auth). Backend auto-detects file type.
 */
export async function uploadGuestFile(
  file: File,
): Promise<{ session: Session; file_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return client.uploadGuestFile(formData);
}

// ============================================================================
// Platform-specific: SSE streaming (uses browser EventSource)
// ============================================================================

/**
 * Stream session updates via Server-Sent Events.
 *
 * Receives events directly from the pipeline as they're resolved — no polling needed.
 * Falls back to pollSession + getSessionEvents if SSE fails.
 *
 * @param sessionId - Session ID to stream
 * @param callbacks - Event handlers for different stream events
 * @returns Cleanup function to close the connection
 */
export function streamSession(
  sessionId: string,
  callbacks: {
    onEvents: (events: CalendarEvent[]) => void
    onTitle?: (title: string) => void
    onIcon?: (icon: string) => void
    onCount?: (count: number) => void
    onStage?: (stage: string) => void
    onComplete: () => void
    onError: (error: string) => void
  }
): () => void {
  const eventSource = new EventSource(`${API_URL}/sessions/${sessionId}/stream`)

  eventSource.addEventListener('init', (e) => {
    const data = JSON.parse(e.data)
    if (data.title && callbacks.onTitle) {
      callbacks.onTitle(data.title)
    }
    if (data.icon && callbacks.onIcon) {
      callbacks.onIcon(data.icon)
    }
  })

  eventSource.addEventListener('event', (e) => {
    const data = JSON.parse(e.data)
    callbacks.onEvents(data.events)
  })

  eventSource.addEventListener('count', (e) => {
    const data = JSON.parse(e.data)
    if (callbacks.onCount) {
      callbacks.onCount(data.count)
    }
  })

  eventSource.addEventListener('title', (e) => {
    const data = JSON.parse(e.data)
    if (callbacks.onTitle) {
      callbacks.onTitle(data.title)
    }
  })

  eventSource.addEventListener('icon', (e) => {
    const data = JSON.parse(e.data)
    if (callbacks.onIcon) {
      callbacks.onIcon(data.icon)
    }
  })

  eventSource.addEventListener('stage', (e) => {
    const data = JSON.parse(e.data)
    if (callbacks.onStage) {
      callbacks.onStage(data.stage)
    }
  })

  eventSource.addEventListener('complete', () => {
    callbacks.onComplete()
    eventSource.close()
  })

  eventSource.addEventListener('error', (e) => {
    if (e instanceof MessageEvent) {
      const data = JSON.parse(e.data)
      callbacks.onError(data.error || 'Processing failed')
    } else {
      callbacks.onError('Connection to server lost')
    }
    eventSource.close()
  })

  eventSource.addEventListener('timeout', () => {
    callbacks.onError('Processing timed out')
    eventSource.close()
  })

  return () => eventSource.close()
}
