/**
 * Configuration types for the API and sync client factories.
 */

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  getGuestAccessToken?: (sessionId: string) => string | null;
}

export interface SyncClientConfig {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
}

export interface ConflictInfo {
  summary: string;
  start_time: string;
  end_time: string;
}
