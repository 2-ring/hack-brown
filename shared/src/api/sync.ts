/**
 * Shared calendar sync client factory.
 */

import type { SyncClientConfig } from './types';
import type { SyncCalendar, SyncResult } from '../types/sync';

export function createSyncClient(config: SyncClientConfig) {
  const { baseUrl, getAccessToken } = config;

  const syncCalendar = async (): Promise<SyncResult> => {
    const token = await getAccessToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}/calendar/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    // Calendar not connected yet — not an error, just means token storage
    // hasn't completed. Return a skip result silently.
    if (response.status === 401 || response.status === 400) {
      return {
        success: true,
        strategy: 'skip' as const,
        synced_at: new Date().toISOString(),
        total_events_in_db: 0,
        is_first_sync: false,
        has_sync_token: false,
        provider: 'unknown',
        calendar_id: 'primary',
        events_added: 0,
        events_updated: 0,
        events_deleted: 0,
        skipped: true,
        reason: 'Calendar not connected yet',
      };
    }

    if (!response.ok) {
      // response.statusText is empty under HTTP/2 — read the body for details
      const body = await response.json().catch(() => null);
      const detail = body?.error || response.statusText || `status ${response.status}`;
      throw new Error(`Sync failed: ${detail}`);
    }

    return response.json();
  };

  const getCalendars = async (): Promise<SyncCalendar[]> => {
    const token = await getAccessToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}/calendar/list`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.calendars || [];
  };

  return { syncCalendar, getCalendars };
}

/**
 * Check if sync is needed based on last sync time.
 * Returns true if > 5 minutes since last sync or never synced.
 */
export const shouldSync = (lastSyncedAt?: string): boolean => {
  if (!lastSyncedAt) return true;
  const lastSync = new Date(lastSyncedAt);
  const now = new Date();
  const minutesSinceSync = (now.getTime() - lastSync.getTime()) / 1000 / 60;
  return minutesSinceSync > 5;
};
