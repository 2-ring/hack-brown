/**
 * Backend API client for DropCal.
 * Handles all API requests with authentication.
 */

import { getAccessToken } from '../auth/supabase';
import { GuestSessionManager } from '../auth/GuestSessionManager';
import type {
  Session,
  CreateSessionResponse,
  GetSessionResponse,
  GetSessionsResponse,
  UploadFileResponse,
  ApiError,
} from './types';
import type { CalendarEvent } from '../workspace/events/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Get authorization headers with current access token.
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Handle API response and throw errors if needed.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));

    throw new Error(error.error || 'API request failed');
  }

  return response.json();
}

/**
 * Create a new text session.
 */
export async function createTextSession(text: string): Promise<Session> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text }),
  });

  const data = await handleResponse<CreateSessionResponse>(response);
  return data.session;
}

/**
 * Upload a file and create a session. Backend auto-detects file type.
 */
export async function uploadFile(
  file: File,
): Promise<{ session: Session; file_url: string }> {
  const token = await getAccessToken();

  const formData = new FormData();
  formData.append('file', file);

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await handleResponse<UploadFileResponse>(response);
  return {
    session: data.session,
    file_url: data.file_url,
  };
}

/**
 * Get a single session by ID.
 */
export async function getSession(sessionId: string): Promise<Session> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
    method: 'GET',
    headers,
  });

  const data = await handleResponse<GetSessionResponse>(response);
  return data.session;
}

/**
 * Get all sessions for the current user.
 */
export async function getUserSessions(limit: number = 50): Promise<Session[]> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/sessions?limit=${limit}`, {
    method: 'GET',
    headers,
  });

  const data = await handleResponse<GetSessionsResponse>(response);
  return data.sessions;
}

/**
 * Poll a session until it's processed or errored.
 * Calls onUpdate callback with session data on each poll.
 *
 * @param sessionId - ID of the session to poll
 * @param onUpdate - Callback function called with updated session data
 * @param intervalMs - Polling interval in milliseconds (default: 2000)
 * @param isGuest - Whether this is a guest session (uses guest endpoint)
 * @returns Promise that resolves with final session when processed or rejects on error
 */
export async function pollSession(
  sessionId: string,
  onUpdate?: (session: Session) => void,
  intervalMs: number = 2000,
  isGuest: boolean = false,
  maxWaitMs: number = 5 * 60 * 1000 // 5 minutes
): Promise<Session> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const poll = async () => {
      try {
        // Bail if we've been waiting too long
        if (Date.now() - startTime > maxWaitMs) {
          reject(new Error('Processing timed out. Please try again.'));
          return;
        }

        // Route to correct endpoint based on guest status
        const session = isGuest
          ? await getGuestSession(sessionId)
          : await getSession(sessionId);

        // Call update callback if provided
        if (onUpdate) {
          onUpdate(session);
        }

        // Check if processing is complete
        if (session.status === 'processed') {
          resolve(session);
        } else if (session.status === 'error') {
          reject(new Error(session.error_message || 'Processing failed'));
        } else {
          // Still pending or processing, poll again
          setTimeout(poll, intervalMs);
        }
      } catch (error) {
        reject(error);
      }
    };

    // Start polling
    poll();
  });
}

/**
 * Health check endpoint.
 */
export async function healthCheck(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_URL}/health`, {
    method: 'GET',
  });

  return handleResponse(response);
}

// ============================================================================
// Authentication & User Profile
// ============================================================================

/**
 * Sync user profile from Supabase Auth to backend.
 * Creates account if first time, updates auth_providers if returning user.
 * Should be called immediately after successful sign-in.
 */
export async function syncUserProfile(): Promise<{
  success: boolean;
  user: {
    id: string;
    email: string;
    display_name: string | null;
    photo_url: string | null;
    provider_connections: Array<{
      provider: string;
      provider_id: string;
      email: string;
      usage: string[];
      display_name?: string;
      photo_url?: string;
      linked_at: string;
    }>;
    primary_auth_provider: string | null;
    primary_calendar_provider: string | null;
    plan: 'free' | 'pro';
  };
  is_new_user: boolean;
  provider: string;
  message: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/auth/sync-profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  return handleResponse(response);
}

/**
 * Get the current user's profile.
 */
export async function getUserProfile(): Promise<{
  success: boolean;
  user: {
    id: string;
    email: string;
    display_name: string | null;
    photo_url: string | null;
    provider_connections: Array<{
      provider: string;
      provider_id: string;
      email: string;
      usage: string[];
      display_name?: string;
      photo_url?: string;
      linked_at: string;
    }>;
    primary_auth_provider: string | null;
    primary_calendar_provider: string | null;
    plan: 'free' | 'pro';
    stripe_customer_id: string | null;
    preferences: any;
    created_at: string;
    updated_at: string;
  };
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/auth/profile`, {
    method: 'GET',
    headers,
  });

  return handleResponse(response);
}

/**
 * Update the current user's profile.
 */
export async function updateUserProfile(updates: {
  display_name?: string;
  photo_url?: string;
}): Promise<{
  success: boolean;
  user: {
    id: string;
    email: string;
    display_name: string | null;
    photo_url: string | null;
  };
  message: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/auth/profile`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updates),
  });

  return handleResponse(response);
}

/**
 * Update user preferences (theme, date format, etc.).
 * Merges provided keys into existing preferences.
 */
export async function updateUserPreferences(prefs: {
  theme_mode?: 'light' | 'dark';
  date_format?: 'MM/DD/YYYY' | 'DD/MM/YYYY';
  timezone?: string;
  autoAddEvents?: boolean;
  conflictBehavior?: 'warn' | 'skip' | 'add';
}): Promise<{
  success: boolean;
  preferences: Record<string, any>;
  message: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/auth/preferences`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(prefs),
  });

  return handleResponse(response);
}

// ============================================================================
// Google Calendar Integration
// ============================================================================

/**
 * Store Google Calendar tokens from OAuth session.
 */
export async function storeGoogleCalendarTokens(providerToken: any): Promise<void> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/auth/google-calendar/store-tokens`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider_token: providerToken }),
  });

  await handleResponse(response);
}

/**
 * Push event(s) to the user's calendar provider.
 * Backend decides create vs update vs skip per event.
 *
 * @param eventIds - Array of event IDs to push
 * @param options - Optional: session context and correction data
 */
export async function pushEvents(
  eventIds: string[],
  options?: {
    sessionId?: string;
    events?: any[];
    extractedFacts?: any[];
  }
): Promise<{
  success: boolean;
  created: string[];
  updated: string[];
  skipped: string[];
  num_created: number;
  num_updated: number;
  num_skipped: number;
  calendar_event_ids: string[];
  num_events_created: number;
  conflicts: any[];
  has_conflicts: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();

  const bodyObj: Record<string, any> = { event_ids: eventIds };
  if (options?.sessionId) bodyObj.session_id = options.sessionId;
  if (options?.events) bodyObj.events = options.events;
  if (options?.extractedFacts) bodyObj.extracted_facts = options.extractedFacts;

  const response = await fetch(`${API_URL}/events/push`, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj),
  });

  return handleResponse(response);
}

// ============================================================================
// Events API
// ============================================================================

/**
 * Get events for a session from the events table.
 * Falls back to processed_events blob for old sessions.
 */
export async function getSessionEvents(
  sessionId: string,
  isGuest: boolean = false
): Promise<CalendarEvent[]> {
  if (isGuest) {
    const accessToken = GuestSessionManager.getAccessToken(sessionId);
    if (!accessToken) {
      throw new Error('Access token not found for guest session.');
    }
    const response = await fetch(
      `${API_URL}/sessions/guest/${sessionId}/events?access_token=${encodeURIComponent(accessToken)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );
    const data = await handleResponse<{ events: CalendarEvent[] }>(response);
    return data.events;
  }

  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/sessions/${sessionId}/events`, {
    method: 'GET',
    headers,
  });
  const data = await handleResponse<{ events: CalendarEvent[] }>(response);
  return data.events;
}

/**
 * Update an event (persists edits and bumps version).
 */
export async function updateEvent(
  eventId: string,
  updates: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/events/${eventId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });

  const data = await handleResponse<{ event: CalendarEvent }>(response);
  return data.event;
}

/**
 * Soft-delete an event.
 */
export async function deleteEvent(
  eventId: string
): Promise<{ success: boolean; event_id: string; session_id?: string; remaining_event_count?: number }> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/events/${eventId}`, {
    method: 'DELETE',
    headers,
  });

  return handleResponse(response);
}

// ============================================================================
// Conflict Detection
// ============================================================================

export interface ConflictInfo {
  summary: string;
  start_time: string;
  end_time: string;
}

/**
 * Batch check conflicts for events against the user's existing calendar.
 * Returns a map from event index to list of conflicting events.
 */
export async function checkEventConflicts(
  events: CalendarEvent[],
  sessionId: string
): Promise<Record<string, ConflictInfo[]>> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/events/check-conflicts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      events: events.map(e => ({
        id: e.id,
        summary: e.summary,
        start: e.start,
        end: e.end,
      })),
      session_id: sessionId,
    }),
  });

  const data = await handleResponse<{ conflicts: Record<string, ConflictInfo[]> }>(response);
  return data.conflicts;
}

// ============================================================================
// Microsoft Calendar Connection
// ============================================================================

/**
 * Send Microsoft OAuth tokens to backend for calendar connection.
 */
export async function sendMicrosoftTokens(tokenData: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  email?: string;
}): Promise<{ success: boolean; message: string; provider: string }> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/auth/microsoft/connect`, {
    method: 'POST',
    headers,
    body: JSON.stringify(tokenData),
  });

  return handleResponse(response);
}

// ============================================================================
// Apple Calendar Connection
// ============================================================================

/**
 * Send Apple ID + app-specific password to backend for CalDAV calendar connection.
 */
export async function sendAppleCredentials(appleId: string, appPassword: string): Promise<{
  success: boolean;
  message: string;
  provider: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/auth/apple/connect`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ apple_id: appleId, app_password: appPassword }),
  });

  return handleResponse(response);
}

// ============================================================================
// Calendar Provider Management
// ============================================================================

/**
 * Get all connected calendar providers for the current user.
 */
export async function getCalendarProviders(): Promise<{
  success: boolean;
  providers: Array<{
    provider: string;
    provider_id: string;
    email: string;
    is_primary: boolean;
    connected: boolean;
    valid: boolean;
  }>;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/calendar/provider/list`, {
    method: 'GET',
    headers,
  });

  return handleResponse(response);
}

/**
 * Set the primary calendar provider.
 */
export async function setPrimaryCalendarProvider(provider: string): Promise<{
  success: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/calendar/provider/set-primary`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider }),
  });

  return handleResponse(response);
}

/**
 * Disconnect a calendar provider.
 */
export async function disconnectCalendarProvider(provider: string): Promise<{
  success: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/calendar/provider/disconnect`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider }),
  });

  return handleResponse(response);
}

/**
 * Get user preferences (timezone, date format, etc.).
 */
export async function getUserPreferences(): Promise<{
  exists: boolean;
  preferences?: {
    user_id: string;
    timezone: string | null;
    date_format: string;
    last_analyzed: string | null;
    total_events_analyzed: number;
  };
  message?: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/personalization/preferences`, {
    method: 'GET',
    headers,
  });

  return handleResponse(response);
}

/**
 * Delete the current user's account and all associated data.
 */
export async function deleteAccount(): Promise<{
  success: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/auth/delete-account`, {
    method: 'DELETE',
    headers,
  });

  return handleResponse(response);
}

// ============================================================================
// Billing & Subscription
// ============================================================================

/**
 * Create a Stripe Checkout session to upgrade to Pro.
 */
export async function createCheckoutSession(): Promise<{ checkout_url: string }> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/billing/create-checkout-session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  return handleResponse(response);
}

/**
 * Create a Stripe Customer Portal session to manage subscription.
 */
export async function createPortalSession(): Promise<{ portal_url: string }> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/billing/create-portal-session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  return handleResponse(response);
}

/**
 * Get user's billing/plan status.
 */
export async function getBillingStatus(): Promise<{
  plan: 'free' | 'pro';
  stripe_customer_id: string | null;
  subscription_status: string | null;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/billing/status`, {
    method: 'GET',
    headers,
  });

  return handleResponse(response);
}

// ============================================================================
// Guest Mode API Functions (No Authentication Required)
// ============================================================================

/**
 * Create guest text session (no auth).
 */
export async function createGuestTextSession(text: string): Promise<Session> {
  const response = await fetch(`${API_URL}/sessions/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input_type: 'text',
      input_content: text,
    }),
  });

  const data = await handleResponse<CreateSessionResponse>(response);
  return data.session;
}

/**
 * Upload file as guest (no auth). Backend auto-detects file type.
 */
export async function uploadGuestFile(
  file: File,
): Promise<{ session: Session; file_url: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/upload/guest`, {
    method: 'POST',
    body: formData,
  });

  const data = await handleResponse<UploadFileResponse>(response);
  return {
    session: data.session,
    file_url: data.file_url,
  };
}

/**
 * Get guest session by ID with access token verification.
 * Retrieves the access token from localStorage and includes it in the request.
 */
export async function getGuestSession(sessionId: string): Promise<Session> {
  // Retrieve the access token for this session from localStorage
  const accessToken = GuestSessionManager.getAccessToken(sessionId);

  if (!accessToken) {
    throw new Error('Access token not found for guest session. Please create a new session.');
  }

  const response = await fetch(
    `${API_URL}/sessions/guest/${sessionId}?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const data = await handleResponse<GetSessionResponse>(response);
  return data.session;
}

/**
 * Migrate guest sessions to user account.
 * Called automatically after sign-in.
 */
export async function migrateGuestSessions(sessionIds: string[]): Promise<void> {
  const headers = await getAuthHeaders();

  await fetch(`${API_URL}/auth/sync-profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ guest_session_ids: sessionIds }),
  });
}
