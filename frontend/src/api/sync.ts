/**
 * Calendar Sync API client.
 * Handles synchronization with calendar providers (Google, Microsoft, Apple).
 */

import { backendClient } from './backend-client';

export interface SyncResult {
  success: boolean;
  strategy: 'incremental' | 'full' | 'skip' | 'fast_incremental';
  synced_at: string;
  last_synced_at?: string;
  minutes_since_last_sync?: number;
  total_events_in_db: number;
  most_recent_event?: string;
  is_first_sync: boolean;
  has_sync_token: boolean;
  provider: string;
  calendar_id: string;
  events_added: number;
  events_updated: number;
  events_deleted: number;
  skipped?: boolean;
  reason?: string;
}

/**
 * Sync calendar with provider.
 * Backend automatically chooses the best sync strategy based on:
 * - Last sync time
 * - Whether we have a sync token
 * - Number of existing events
 *
 * Call this when:
 * - App opens
 * - User navigates to events view
 * - User manually clicks refresh
 *
 * @returns Sync results with statistics
 */
export const syncCalendar = async (): Promise<SyncResult> => {
  const response = await backendClient.post('/api/calendar/sync');
  return response.data;
};

/**
 * Check if sync is needed based on last sync time.
 *
 * @param lastSyncedAt - ISO timestamp of last sync
 * @returns true if sync is needed (> 5 minutes ago or never synced)
 */
export const shouldSync = (lastSyncedAt?: string): boolean => {
  if (!lastSyncedAt) return true;

  const lastSync = new Date(lastSyncedAt);
  const now = new Date();
  const minutesSinceSync = (now.getTime() - lastSync.getTime()) / 1000 / 60;

  // Sync if last sync was > 5 minutes ago
  return minutesSinceSync > 5;
};
