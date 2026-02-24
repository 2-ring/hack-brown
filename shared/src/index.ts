// ── Types: API ──
export type {
  PlanType,
  User,
  Session,
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionResponse,
  GetSessionsResponse,
  UploadFileResponse,
  ApiError,
} from './types/api'

// ── Types: Events ──
export type {
  CalendarDateTime,
  CalendarEvent,
  ProviderSync,
  IdentifiedEvent,
  IdentificationResult,
} from './types/events'
export { getEffectiveDateTime, isAllDay, getEventSyncStatus } from './types/events'

// ── Types: Sync ──
export type { SyncCalendar, SyncResult } from './types/sync'

// ── Storage ──
export type { StorageAdapter } from './storage/types'

// ── Auth ──
export { GuestSessionManager } from './auth/guest'

// ── API Client ──
export type { ApiClientConfig, SyncClientConfig, ConflictInfo } from './api/types'
export { createApiClient } from './api/client'
export type { ApiClient } from './api/client'

// ── Sync Client ──
export { createSyncClient, shouldSync } from './api/sync'

// ── Events: Recurrence ──
export type {
  RecurrenceFrequency,
  EndType,
  DayCode,
  RecurrenceConfig,
} from './events/recurrence'
export {
  ALL_DAYS,
  DAY_LABELS,
  DAY_SHORT,
  FREQUENCY_LABELS,
  getDefaultConfig,
  parseRRule,
  buildRRule,
  formatRecurrence,
  formatConfig,
} from './events/recurrence'

// ── Events: Timezone ──
export type { TimezoneOption } from './events/timezone'
export {
  getTimezoneList,
  formatTimezoneCompact,
  formatTimezoneDisplay,
  filterTimezones,
} from './events/timezone'

// ── Utils ──
export { getGreeting } from './utils/greetings'
export { getFriendlyErrorMessage } from './utils/errors'
