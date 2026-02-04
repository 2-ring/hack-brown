import { motion } from 'framer-motion'
import { Equals as EqualsIcon, PencilSimple as EditIcon, Calendar as CalendarIcon } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'
import type { CalendarEvent } from './types'

interface EventProps {
  event: CalendarEvent | null
  index: number
  isLoading?: boolean
  isLoadingCalendars?: boolean

  // Editing state
  editingField?: { eventIndex: number; field: 'summary' | 'date' | 'description' } | null
  inputRef?: React.RefObject<HTMLInputElement | null>

  // Display helpers
  formatDate: (dateTime: string, endDateTime?: string) => string
  buildDescription: (event: CalendarEvent) => string
  getCalendarColor: (calendarName: string | undefined) => string
  getTextColor: (backgroundColor: string) => string

  // Event handlers
  onEditClick: (eventIndex: number, field: 'summary' | 'date' | 'description', e?: React.MouseEvent) => void
  onEditChange: (eventIndex: number, field: string, value: string) => void
  onEditBlur: () => void
  onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export function Event({
  event,
  index,
  isLoading = false,
  isLoadingCalendars = false,
  editingField,
  inputRef,
  formatDate,
  buildDescription,
  getCalendarColor,
  getTextColor,
  onEditClick,
  onEditChange,
  onEditBlur,
  onEditKeyDown,
}: EventProps) {
  // Loading skeleton - simplified to single rounded box
  if (isLoading && !event) {
    return (
      <motion.div
        key={`skeleton-${index}`}
        className="event-confirmation-card skeleton-card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.1 }}
      >
        <Skeleton height="100%" borderRadius={12} containerClassName="skeleton-full-height" />
      </motion.div>
    )
  }

  // No event
  if (!event) return null

  // Actual event card
  return (
    <motion.div
      key={`event-${index}`}
      className="event-confirmation-card"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
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

      {/* Date */}
      <div className="event-confirmation-card-row">
        <div className="editable-content-wrapper" onClick={(e) => onEditClick(index, 'date', e)}>
          {editingField?.eventIndex === index && editingField?.field === 'date' ? (
            <input
              ref={inputRef}
              type="text"
              className="event-confirmation-card-date editable-input"
              value={formatDate(event.start.dateTime, event.end.dateTime)}
              onChange={(e) => onEditChange(index, 'date', e.target.value)}
              onBlur={onEditBlur}
              onKeyDown={onEditKeyDown}
            />
          ) : (
            <div className="event-confirmation-card-date">
              {formatDate(event.start.dateTime, event.end.dateTime)}
            </div>
          )}
          <EditIcon size={14} weight="regular" className="edit-icon" />
        </div>
      </div>

      {/* Description */}
      <div className="event-confirmation-card-row">
        <div className="event-confirmation-card-description">
          <EqualsIcon size={16} weight="bold" className="description-icon" />
          <div className="editable-content-wrapper" onClick={(e) => onEditClick(index, 'description', e)}>
            {editingField?.eventIndex === index && editingField?.field === 'description' ? (
              <input
                ref={inputRef}
                type="text"
                className="editable-input description-input"
                value={buildDescription(event)}
                onChange={(e) => onEditChange(index, 'description', e.target.value)}
                onBlur={onEditBlur}
                onKeyDown={onEditKeyDown}
              />
            ) : (
              <span>{buildDescription(event)}</span>
            )}
            <EditIcon size={14} weight="regular" className="edit-icon" />
          </div>
        </div>
      </div>

      {/* Calendar badge */}
      {event.calendar && (
        <div className="event-confirmation-card-row">
          {isLoadingCalendars ? (
            <Skeleton width={100} height={24} borderRadius={12} />
          ) : (
            <div
              className="event-calendar-badge"
              style={{
                backgroundColor: getCalendarColor(event.calendar),
                color: getTextColor(getCalendarColor(event.calendar))
              }}
            >
              <CalendarIcon size={14} weight="fill" />
              <span>{event.calendar}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
