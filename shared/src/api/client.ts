/**
 * Shared API client factory.
 *
 * Creates a fully-typed API client given platform-specific config
 * (base URL, auth token getter, guest token getter).
 *
 * Excludes streamSession (browser EventSource-dependent) — that stays platform-specific.
 * uploadFile/uploadGuestFile accept FormData so each platform constructs it natively.
 */

import type { ApiClientConfig, ConflictInfo } from './types';
import type {
  Session,
  CreateSessionResponse,
  GetSessionResponse,
  GetSessionsResponse,
  UploadFileResponse,
  ApiError,
} from '../types/api';
import type { CalendarEvent } from '../types/events';

export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, getAccessToken, getGuestAccessToken } = config;

  async function getAuthHeaders(): Promise<HeadersInit> {
    const token = await getAccessToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      throw new Error(error.error || 'API request failed');
    }
    return response.json();
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  async function createTextSession(text: string): Promise<Session> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });
    const data = await handleResponse<CreateSessionResponse>(response);
    return data.session;
  }

  /**
   * Upload a file and create a session.
   * Accepts FormData so each platform can construct it natively:
   * - Web: formData.append('file', fileObject)
   * - RN:  formData.append('file', { uri, name, type })
   */
  async function uploadFile(
    formData: FormData,
  ): Promise<{ session: Session; file_url: string }> {
    const token = await getAccessToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await handleResponse<UploadFileResponse>(response);
    return { session: data.session, file_url: data.file_url };
  }

  async function getSession(sessionId: string): Promise<Session> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/sessions/${sessionId}`, {
      method: 'GET',
      headers,
    });
    const data = await handleResponse<GetSessionResponse>(response);
    return data.session;
  }

  async function getUserSessions(limit: number = 50): Promise<Session[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/sessions?limit=${limit}`, {
      method: 'GET',
      headers,
    });
    const data = await handleResponse<GetSessionsResponse>(response);
    return data.sessions;
  }

  async function pollSession(
    sessionId: string,
    onUpdate?: (session: Session) => void,
    intervalMs: number = 2000,
    isGuest: boolean = false,
    maxWaitMs: number = 5 * 60 * 1000
  ): Promise<Session> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const poll = async () => {
        try {
          if (Date.now() - startTime > maxWaitMs) {
            reject(new Error('Processing timed out. Please try again.'));
            return;
          }

          const session = isGuest
            ? await getGuestSession(sessionId)
            : await getSession(sessionId);

          if (onUpdate) {
            onUpdate(session);
          }

          if (session.status === 'processed') {
            resolve(session);
          } else if (session.status === 'error') {
            reject(new Error(session.error_message || 'Processing failed'));
          } else {
            setTimeout(poll, intervalMs);
          }
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  async function healthCheck(): Promise<{ status: string; message: string }> {
    const response = await fetch(`${baseUrl}/health`, { method: 'GET' });
    return handleResponse(response);
  }

  // ============================================================================
  // Authentication & User Profile
  // ============================================================================

  async function syncUserProfile(timezone?: string): Promise<{
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
    const body: Record<string, string> = {};
    if (timezone) {
      body.timezone = timezone;
    } else {
      try {
        body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        // Intl may not be fully available on all platforms
      }
    }
    const response = await fetch(`${baseUrl}/auth/sync-profile`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  }

  async function getUserProfile(): Promise<{
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
    const response = await fetch(`${baseUrl}/auth/profile`, {
      method: 'GET',
      headers,
    });
    return handleResponse(response);
  }

  async function updateUserProfile(updates: {
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
    const response = await fetch(`${baseUrl}/auth/profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  }

  async function updateUserPreferences(prefs: {
    theme_mode?: 'light' | 'dark' | 'auto';
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
    const response = await fetch(`${baseUrl}/auth/preferences`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(prefs),
    });
    return handleResponse(response);
  }

  // ============================================================================
  // Google Calendar Integration
  // ============================================================================

  async function storeGoogleCalendarTokens(providerToken: any): Promise<void> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/auth/google-calendar/store-tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider_token: providerToken }),
    });
    await handleResponse(response);
  }

  async function pushEvents(
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
    const response = await fetch(`${baseUrl}/events/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
    });
    return handleResponse(response);
  }

  async function syncSessionInbound(sessionId: string): Promise<{
    success: boolean;
    checked: number;
    updated: number;
    deleted: number;
    skipped_stale: boolean;
    events: CalendarEvent[];
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/sessions/${sessionId}/sync-inbound`, {
      method: 'POST',
      headers,
    });
    return handleResponse(response);
  }

  // ============================================================================
  // Events API
  // ============================================================================

  async function getSessionEvents(
    sessionId: string,
    isGuest: boolean = false
  ): Promise<CalendarEvent[]> {
    if (isGuest && getGuestAccessToken) {
      const accessToken = getGuestAccessToken(sessionId);
      if (!accessToken) {
        throw new Error('Access token not found for guest session.');
      }
      const response = await fetch(
        `${baseUrl}/sessions/guest/${sessionId}/events?access_token=${encodeURIComponent(accessToken)}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );
      const data = await handleResponse<{ events: CalendarEvent[] }>(response);
      return data.events;
    }

    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/sessions/${sessionId}/events`, {
      method: 'GET',
      headers,
    });
    const data = await handleResponse<{ events: CalendarEvent[] }>(response);
    return data.events;
  }

  async function updateEvent(
    eventId: string,
    updates: Partial<CalendarEvent>
  ): Promise<CalendarEvent> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/events/${eventId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });
    const data = await handleResponse<{ event: CalendarEvent }>(response);
    return data.event;
  }

  async function deleteEvent(
    eventId: string
  ): Promise<{ success: boolean; event_id: string; session_id?: string; remaining_event_count?: number }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/events/${eventId}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse(response);
  }

  async function applyModifications(
    sessionId: string,
    actions: { event_id?: string; action: 'edit' | 'delete' | 'create'; event?: Partial<CalendarEvent> }[]
  ): Promise<CalendarEvent[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/sessions/${sessionId}/modifications`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ actions }),
    });
    const data = await handleResponse<{ events: CalendarEvent[] }>(response);
    return data.events;
  }

  // ============================================================================
  // Conflict Detection
  // ============================================================================

  async function checkEventConflicts(
    events: CalendarEvent[],
    sessionId: string
  ): Promise<Record<string, ConflictInfo[]>> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/events/check-conflicts`, {
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

  async function sendMicrosoftTokens(tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    email?: string;
  }): Promise<{ success: boolean; message: string; provider: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/auth/microsoft/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify(tokenData),
    });
    return handleResponse(response);
  }

  // ============================================================================
  // Apple Calendar Connection
  // ============================================================================

  async function sendAppleCredentials(appleId: string, appPassword: string): Promise<{
    success: boolean;
    message: string;
    provider: string;
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/auth/apple/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ apple_id: appleId, app_password: appPassword }),
    });
    return handleResponse(response);
  }

  // ============================================================================
  // Calendar Provider Management
  // ============================================================================

  async function getCalendarProviders(): Promise<{
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
    const response = await fetch(`${baseUrl}/calendar/provider/list`, {
      method: 'GET',
      headers,
    });
    return handleResponse(response);
  }

  async function setPrimaryCalendarProvider(provider: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/calendar/provider/set-primary`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider }),
    });
    return handleResponse(response);
  }

  async function disconnectCalendarProvider(provider: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/calendar/provider/disconnect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider }),
    });
    return handleResponse(response);
  }

  // ============================================================================
  // User Preferences
  // ============================================================================

  async function getUserPreferences(): Promise<{
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
    const response = await fetch(`${baseUrl}/personalization/preferences`, {
      method: 'GET',
      headers,
    });
    return handleResponse(response);
  }

  // ============================================================================
  // Account Management
  // ============================================================================

  async function deleteAccount(): Promise<{
    success: boolean;
    message: string;
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/auth/delete-account`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse(response);
  }

  // ============================================================================
  // Billing & Subscription
  // ============================================================================

  async function createCheckoutSession(): Promise<{ checkout_url: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/billing/create-checkout-session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    return handleResponse(response);
  }

  async function createPortalSession(): Promise<{ portal_url: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/billing/create-portal-session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    return handleResponse(response);
  }

  async function getBillingStatus(): Promise<{
    plan: 'free' | 'pro';
    stripe_customer_id: string | null;
    subscription_status: string | null;
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${baseUrl}/billing/status`, {
      method: 'GET',
      headers,
    });
    return handleResponse(response);
  }

  // ============================================================================
  // Guest Mode
  // ============================================================================

  async function createGuestTextSession(text: string): Promise<Session> {
    const response = await fetch(`${baseUrl}/sessions/guest`, {
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

  async function uploadGuestFile(
    formData: FormData,
  ): Promise<{ session: Session; file_url: string }> {
    const response = await fetch(`${baseUrl}/upload/guest`, {
      method: 'POST',
      body: formData,
    });
    const data = await handleResponse<UploadFileResponse>(response);
    return { session: data.session, file_url: data.file_url };
  }

  async function getGuestSession(sessionId: string): Promise<Session> {
    if (!getGuestAccessToken) {
      throw new Error('Guest access token getter not configured.');
    }
    const accessToken = getGuestAccessToken(sessionId);
    if (!accessToken) {
      throw new Error('Access token not found for guest session. Please create a new session.');
    }
    const response = await fetch(
      `${baseUrl}/sessions/guest/${sessionId}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );
    const data = await handleResponse<GetSessionResponse>(response);
    return data.session;
  }

  async function migrateGuestSessions(sessionIds: string[]): Promise<void> {
    const headers = await getAuthHeaders();
    await fetch(`${baseUrl}/auth/sync-profile`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ guest_session_ids: sessionIds }),
    });
  }

  return {
    // Session CRUD
    createTextSession,
    uploadFile,
    getSession,
    getUserSessions,
    pollSession,
    healthCheck,

    // Auth & Profile
    syncUserProfile,
    getUserProfile,
    updateUserProfile,
    updateUserPreferences,

    // Google Calendar
    storeGoogleCalendarTokens,
    pushEvents,
    syncSessionInbound,

    // Events API
    getSessionEvents,
    updateEvent,
    deleteEvent,
    applyModifications,

    // Conflict Detection
    checkEventConflicts,

    // Microsoft Calendar
    sendMicrosoftTokens,

    // Apple Calendar
    sendAppleCredentials,

    // Calendar Provider Management
    getCalendarProviders,
    setPrimaryCalendarProvider,
    disconnectCalendarProvider,

    // User Preferences
    getUserPreferences,

    // Account
    deleteAccount,

    // Billing
    createCheckoutSession,
    createPortalSession,
    getBillingStatus,

    // Guest Mode
    createGuestTextSession,
    uploadGuestFile,
    getGuestSession,
    migrateGuestSessions,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
