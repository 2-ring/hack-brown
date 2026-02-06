/**
 * Backend API client for DropCal Mobile.
 * Handles all API requests with authentication.
 */

// TODO: Replace these placeholder imports once auth is ported (Task 41: Port AuthContext)
// These functions will be implemented in /mobile/src/auth/ directory
// import { getAccessToken } from '../auth/supabase';
// import { GuestSessionManager } from '../auth/GuestSessionManager';

import type {
  Session,
  CreateSessionResponse,
  GetSessionResponse,
  GetSessionsResponse,
  UploadFileResponse,
  ApiError,
} from './types';
import { API_URL } from './config';

// ============================================================================
// Temporary Auth Stubs (to be replaced by Task 41)
// ============================================================================

/**
 * Temporary stub for getAccessToken.
 * Will be replaced when AuthContext is ported (Task 41).
 */
async function getAccessToken(): Promise<string | null> {
  // TODO: Replace with actual implementation from Task 41
  console.warn('getAccessToken stub called - auth not yet implemented');
  return null;
}

/**
 * Temporary stub for GuestSessionManager.
 * Will be replaced when AuthContext is ported (Task 41).
 */
const GuestSessionManager = {
  getAccessToken: (sessionId: string): string | null => {
    // TODO: Replace with actual implementation from Task 41
    console.warn('GuestSessionManager.getAccessToken stub called - auth not yet implemented');
    return null;
  },
};

// ============================================================================
// API Client Functions
// ============================================================================

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

  const response = await fetch(`${API_URL}/api/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input_type: 'text',
      input_content: text,
    }),
  });

  const data = await handleResponse<CreateSessionResponse>(response);
  return data.session;
}

/**
 * Upload a file (image or audio) and create a session.
 */
export async function uploadFile(
  file: File,
  type: 'image' | 'audio'
): Promise<{ session: Session; file_url: string }> {
  const token = await getAccessToken();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('input_type', type);

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/api/upload`, {
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

  const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
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

  const response = await fetch(`${API_URL}/api/sessions?limit=${limit}`, {
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
  isGuest: boolean = false
): Promise<Session> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
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
  const response = await fetch(`${API_URL}/api/health`, {
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
  };
  is_new_user: boolean;
  provider: string;
  message: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/auth/sync-profile`, {
    method: 'POST',
    headers,
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
    preferences: any;
    created_at: string;
    updated_at: string;
  };
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/auth/profile`, {
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

  const response = await fetch(`${API_URL}/api/auth/profile`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updates),
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

  const response = await fetch(`${API_URL}/api/auth/google-calendar/store-tokens`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider_token: providerToken }),
  });

  await handleResponse(response);
}

/**
 * Check if user has connected Google Calendar.
 */
export async function checkGoogleCalendarStatus(): Promise<{
  connected: boolean;
  valid: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/auth/google-calendar/status`, {
    method: 'GET',
    headers,
  });

  return handleResponse(response);
}

/**
 * Add a session's processed events to Google Calendar.
 *
 * @param sessionId - The session ID
 * @param events - Optional: User's edited events (for correction logging)
 */
export async function addSessionToCalendar(
  sessionId: string,
  events?: any[]
): Promise<{
  success: boolean;
  calendar_event_ids: string[];
  num_events_created: number;
  conflicts: any[];
  has_conflicts: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();

  // Prepare request body if events are provided (for correction logging)
  const body = events ? JSON.stringify({ events }) : undefined;

  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/add-to-calendar`, {
    method: 'POST',
    headers,
    body,
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

  const response = await fetch(`${API_URL}/api/calendar/providers`, {
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

  const response = await fetch(`${API_URL}/api/calendar/set-primary-provider`, {
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

  const response = await fetch(`${API_URL}/api/calendar/disconnect-provider`, {
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

  const response = await fetch(`${API_URL}/api/personalization/preferences`, {
    method: 'GET',
    headers,
  });

  // Handle 404 as a valid response (no preferences yet)
  if (response.status === 404) {
    return { exists: false };
  }

  return handleResponse(response);
}

// ============================================================================
// Guest Mode API Functions (No Authentication Required)
// ============================================================================

/**
 * Create guest text session (no auth).
 */
export async function createGuestTextSession(text: string): Promise<Session> {
  const response = await fetch(`${API_URL}/api/sessions/guest`, {
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
 * Upload file as guest (no auth).
 */
export async function uploadGuestFile(
  file: File,
  type: 'image' | 'audio'
): Promise<{ session: Session; file_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('input_type', type);

  const response = await fetch(`${API_URL}/api/upload/guest`, {
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
    `${API_URL}/api/sessions/guest/${sessionId}?access_token=${encodeURIComponent(accessToken)}`,
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

  await fetch(`${API_URL}/api/auth/sync-profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ guest_session_ids: sessionIds }),
  });
}
