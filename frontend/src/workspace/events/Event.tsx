import { Equals as EqualsIcon, MapPin as LocationIcon } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'
import type { CalendarEvent } from './types'

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
        </div>
      </div>

      {/* Location */}
      {event.location && (
        <div className="event-confirmation-card-row">
          <div className="event-confirmation-card-meta">
            <LocationIcon size={16} weight="bold" className="meta-icon" />
            <span>{event.location}</span>
          </div>
        </div>
      )}

      {/* Description */}
      {event.description && (
        <div className="event-confirmation-card-row">
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
    </div>
  )
}
