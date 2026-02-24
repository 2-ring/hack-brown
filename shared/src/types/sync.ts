/**
 * Calendar sync types.
 */

export interface SyncCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor?: string;
  primary?: boolean;
  description?: string;
}

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
  calendars?: SyncCalendar[];
  events_added: number;
  events_updated: number;
  events_deleted: number;
  skipped?: boolean;
  reason?: string;
}
