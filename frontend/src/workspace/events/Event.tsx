import { Equals as EqualsIcon, MapPin as LocationIcon, ArrowsClockwise as RepeatIcon, CheckCircle, ArrowsClockwise, Warning } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'
import type { CalendarEvent } from './types'
import { getEventSyncStatus } from './types'
import { formatRecurrence } from './recurrence'
import type { ConflictInfo } from '../../api/backend-client'

interface GoogleCalendar {
  id: string
  summary: string
  backgroundColor: string
  foregroundColor?: string
  primary?: boolean
}

interface EventProps {
  event: CalendarEvent | null
  index: number
  isLoading?: boolean
  isLoadingCalendars?: boolean
  skeletonOpacity?: number
  calendars?: GoogleCalendar[]

  // Display helpers
  formatDate: (dateTime: string, endDateTime?: string) => string
  formatTime: (dateTime: string) => string
  formatTimeRange: (start: string, end: string) => string
  getCalendarColor: (calendarName: string | undefined) => string

  // Sync status
  activeProvider?: string
  conflictInfo?: ConflictInfo[]

  // Event handlers
  onClick?: () => void
}

export function Event({
  event,
  index,
  isLoading = false,
  skeletonOpacity = 1,
  calendars = [],
  formatTimeRange,
  getCalendarColor,
  activeProvider,
  conflictInfo,
  onClick,
}: EventProps) {
  // Loading skeleton - simple grey box with fade effect like session skeletons
  if (isLoading && !event) {
    return (
      <div key={`skeleton-${index}`} style={{ padding: '0', opacity: skeletonOpacity }}>
        <Skeleton height={140} borderRadius={16} />
      </div>
    )
  }

  // No event
  if (!event) return null

  // Actual event card
  const calendarColor = getCalendarColor(event.calendar)

  return (
    <div
      key={`event-${index}`}
      className="event-confirmation-card event-card-clickable"
      style={{ borderLeft: `8px solid ${calendarColor}`, backgroundColor: `${calendarColor}12` }}
      onClick={onClick}
    >
      {/* Title with Time */}
      <div className="event-confirmation-card-row">
        <div className="event-confirmation-card-title">
          {event.summary}{' '}
          <span className="event-confirmation-card-time-inline">
            ({formatTimeRange(event.start.dateTime, event.end.dateTime)})
          </span>
          {event.recurrence && event.recurrence.length > 0 && (
            <span className="event-recurrence-after-time">
              <RepeatIcon size={14} weight="bold" className="meta-icon" />
              {formatRecurrence(event.recurrence)}
            </span>
          )}
        </div>
      </div>

      {/* Location & Recurrence (inline) */}
      {(event.location || (event.recurrence && event.recurrence.length > 0)) && (
        <div className="event-confirmation-card-row event-row-location">
          <div className="event-confirmation-card-meta-inline">
            {event.location && (
              <div className="event-confirmation-card-meta">
                <LocationIcon size={16} weight="bold" className="meta-icon" />
                <span>{event.location}</span>
              </div>
            )}
            {event.recurrence && event.recurrence.length > 0 && (
              <div className="event-confirmation-card-meta event-recurrence-in-meta">
                <RepeatIcon size={16} weight="bold" className="meta-icon" />
                <span>{formatRecurrence(event.recurrence)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      {event.description && (
        <div className="event-confirmation-card-row event-row-description">
          <div className="event-confirmation-card-meta">
            <EqualsIcon size={16} weight="bold" className="meta-icon" />
            <span>{event.description}</span>
          </div>
        </div>
      )}

      {/* Calendar Badge */}
      <div className="event-confirmation-card-row">
        <div className="event-calendar-badge">
          <div
            className="calendar-badge-dot"
            style={{ backgroundColor: calendarColor }}
          />
          <span className="calendar-badge-text">
            {calendars.find(cal =>
              cal.id === event.calendar ||
              cal.summary.toLowerCase() === event.calendar?.toLowerCase()
            )?.summary || event.calendar || 'Primary'}
          </span>
        </div>
      </div>

      {/* Status Bar — sync status takes priority over conflicts */}
      {(() => {
        const syncStatus = getEventSyncStatus(event, activeProvider)

        if (syncStatus !== 'draft') {
          const config = {
            applied: { label: 'Created', Icon: CheckCircle, className: 'status-created' },
            edited: { label: 'Edits applied', Icon: ArrowsClockwise, className: 'status-apply-edits' },
          } as const

          const status = config[syncStatus]

          return (
            <div className={`event-status-bar ${status.className}`}>
              <status.Icon size={14} weight="bold" />
              <span>{status.label}</span>
            </div>
          )
        }

        if (conflictInfo && conflictInfo.length > 0) {
          const message = conflictInfo.length === 1
            ? `Conflict with ${conflictInfo[0].summary} (${formatTimeRange(conflictInfo[0].start_time, conflictInfo[0].end_time)})`
            : 'Conflict with multiple events'

          return (
            <div className="event-status-bar status-conflict">
              <Warning size={14} weight="bold" />
              <span>{message}</span>
            </div>
          )
        }

        return null
      })()}
    </div>
  )
}
