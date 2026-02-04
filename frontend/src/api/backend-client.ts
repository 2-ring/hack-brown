/**
 * Backend API client for DropCal.
 * Handles all API requests with authentication.
 */

import { getAccessToken } from '../auth/supabase';
import type {
  Session,
  CreateSessionResponse,
  GetSessionResponse,
  GetSessionsResponse,
  UploadFileResponse,
  ApiError,
} from './types';

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
 * @returns Promise that resolves with final session when processed or rejects on error
 */
export async function pollSession(
  sessionId: string,
  onUpdate?: (session: Session) => void,
  intervalMs: number = 2000
): Promise<Session> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const session = await getSession(sessionId);

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
 */
export async function addSessionToCalendar(sessionId: string): Promise<{
  success: boolean;
  calendar_event_ids: string[];
  num_events_created: number;
  conflicts: any[];
  has_conflicts: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/add-to-calendar`, {
    method: 'POST',
    headers,
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
