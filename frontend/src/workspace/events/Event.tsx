import { Equals as EqualsIcon, PencilSimple as EditIcon } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'
import type { CalendarEvent } from './types'
import { EventCalendarSelector } from './EventCalendarSelector'

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

  // Editing state
  editingField?: { eventIndex: number; field: 'summary' | 'date' | 'time' | 'location' | 'description' } | null
  inputRef?: React.RefObject<HTMLInputElement | null>

  // Display helpers
  formatDate: (dateTime: string, endDateTime?: string) => string
  formatTime: (dateTime: string) => string
  formatTimeRange: (start: string, end: string) => string
  getCalendarColor: (calendarName: string | undefined) => string
  getTextColor: (backgroundColor: string) => string

  // Event handlers
  onEditClick: (eventIndex: number, field: 'summary' | 'date' | 'time' | 'location' | 'description', e?: React.MouseEvent) => void
  onEditChange: (eventIndex: number, field: string, value: string) => void
  onEditBlur: () => void
  onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onCalendarChange?: (eventIndex: number, calendarId: string) => void
}

export function Event({
  event,
  index,
  isLoading = false,
  isLoadingCalendars = false,
  skeletonOpacity = 1,
  calendars = [],
  editingField,
  inputRef,
  formatDate,
  formatTime,
  formatTimeRange,
  getCalendarColor,
  getTextColor,
  onEditClick,
  onEditChange,
  onEditBlur,
  onEditKeyDown,
  onCalendarChange,
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
      className="event-confirmation-card"
      style={{ borderLeft: `4px solid ${calendarColor}` }}
    >
      {/* Title */}
      <div className="event-confirmation-card-row">
        <div className="editable-content-wrapper" onClick={(e) => onEditClick(index, 'summary', e)}>
          {editingField?.eventIndex === index && editingField?.field === 'summary' ? (
            <input
              ref={inputRef}
              type="text"
              className="event-confirmation-card-title editable-input"
              value={event.summary}
              onChange={(e) => onEditChange(index, 'summary', e.target.value)}
              onBlur={onEditBlur}
              onKeyDown={onEditKeyDown}
            />
          ) : (
            <div className="event-confirmation-card-title">
              {event.summary}
            </div>
          )}
          <EditIcon size={16} weight="regular" className="edit-icon" />
        </div>
      </div>

      {/* Time Range */}
      <div className="event-confirmation-card-row">
        <div className="editable-content-wrapper" onClick={(e) => onEditClick(index, 'time', e)}>
          {editingField?.eventIndex === index && editingField?.field === 'time' ? (
            <input
              ref={inputRef}
              type="text"
              className="event-confirmation-card-time editable-input"
              value={formatTimeRange(event.start.dateTime, event.end.dateTime)}
              onChange={(e) => onEditChange(index, 'time', e.target.value)}
              onBlur={onEditBlur}
              onKeyDown={onEditKeyDown}
            />
          ) : (
            <div className="event-confirmation-card-time">
              {formatTimeRange(event.start.dateTime, event.end.dateTime)}
            </div>
          )}
          <EditIcon size={14} weight="regular" className="edit-icon" />
        </div>
      </div>

      {/* Location */}
      {event.location && (
        <div className="event-confirmation-card-row">
          <div className="event-confirmation-card-meta">
            <EqualsIcon size={16} weight="bold" className="meta-icon" />
            <div className="editable-content-wrapper" onClick={(e) => onEditClick(index, 'location', e)}>
              {editingField?.eventIndex === index && editingField?.field === 'location' ? (
                <input
                  ref={inputRef}
                  type="text"
                  className="editable-input meta-input"
                  value={event.location}
                  onChange={(e) => onEditChange(index, 'location', e.target.value)}
                  onBlur={onEditBlur}
                  onKeyDown={onEditKeyDown}
                />
              ) : (
                <span>{event.location}</span>
              )}
              <EditIcon size={14} weight="regular" className="edit-icon" />
            </div>
          </div>
        </div>
      )}

      {/* Description */}
      {event.description && (
        <div className="event-confirmation-card-row">
          <div className="event-confirmation-card-meta">
            <EqualsIcon size={16} weight="bold" className="meta-icon" />
            <div className="editable-content-wrapper" onClick={(e) => onEditClick(index, 'description', e)}>
              {editingField?.eventIndex === index && editingField?.field === 'description' ? (
                <input
                  ref={inputRef}
                  type="text"
                  className="editable-input meta-input"
                  value={event.description}
                  onChange={(e) => onEditChange(index, 'description', e.target.value)}
                  onBlur={onEditBlur}
                  onKeyDown={onEditKeyDown}
                />
              ) : (
                <span>{event.description}</span>
              )}
              <EditIcon size={14} weight="regular" className="edit-icon" />
            </div>
          </div>
        </div>
      )}

      {/* Calendar Selector */}
      <div className="event-confirmation-card-row">
        <EventCalendarSelector
          selectedCalendarId={event.calendar}
          calendars={calendars}
          isLoading={isLoadingCalendars}
          onCalendarSelect={(calendarId) => onCalendarChange?.(index, calendarId)}
        />
      </div>
    </div>
  )
}
