/**
 * Calendar Sync API client.
 * Thin wrapper over the shared sync client with platform-specific config.
 */

import { createSyncClient, shouldSync } from '@dropcal/shared';
import type { SyncCalendar, SyncResult } from '@dropcal/shared';
import { getAccessToken } from '../auth/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const syncClient = createSyncClient({
  baseUrl: API_URL,
  getAccessToken,
});

export const { syncCalendar, getCalendars } = syncClient;
export { shouldSync };
export type { SyncCalendar, SyncResult };
