import { motion } from 'framer-motion'
import { CalendarBlank as CalendarIcon, Equals as EqualsIcon } from '@phosphor-icons/react'
import type { CalendarEvent } from '../types/calendarEvent'
import './EventConfirmation.css'

interface EventConfirmationProps {
  events: CalendarEvent[]
  onConfirm?: () => void
  onCancel?: () => void
}

export function EventConfirmation({ events, onConfirm, onCancel }: EventConfirmationProps) {
  const formatDate = (dateTime: string, endDateTime?: string): string => {
    const start = new Date(dateTime)
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    }

    if (endDateTime) {
      const end = new Date(endDateTime)
      // Check if it's a multi-day event
      if (start.toDateString() !== end.toDateString()) {
        const startFormatted = start.toLocaleDateString('en-US', options)
        const endFormatted = end.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
        return `${startFormatted} – ${endFormatted}`
      }
    }

    return start.toLocaleDateString('en-US', options)
  }

  const formatTime = (dateTime: string): string => {
    const date = new Date(dateTime)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const buildDescription = (event: CalendarEvent): string => {
    const parts: string[] = []

    // Add time information
    const startTime = formatTime(event.start.dateTime)
    const endTime = formatTime(event.end.dateTime)

    if (startTime !== endTime) {
      parts.push(`${startTime} - ${endTime}`)
    } else {
      parts.push(startTime)
    }

    // Add location if available
    if (event.location) {
      parts.push(event.location)
    }

    // Add description if available
    if (event.description) {
      parts.push(event.description)
    }

    return parts.join('. ')
  }

  return (
    <motion.div
      className="event-confirmation"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className="event-confirmation-header">
        <CalendarIcon size={20} weight="fill" />
        <span>Google Calendar</span>
      </div>

      <div className="event-confirmation-list">
        {events.map((event, index) => (
          <motion.div
            key={index}
            className="event-confirmation-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <div className="event-confirmation-card-title">
              {event.summary}
            </div>
            <div className="event-confirmation-card-date">
              {formatDate(event.start.dateTime, event.end.dateTime)}
            </div>
            <div className="event-confirmation-card-description">
              <EqualsIcon size={16} weight="bold" className="description-icon" />
              <span>{buildDescription(event)}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {(onConfirm || onCancel) && (
        <div className="event-confirmation-actions">
          {onCancel && (
            <button
              className="event-confirmation-button secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          {onConfirm && (
            <button
              className="event-confirmation-button primary"
              onClick={onConfirm}
            >
              Add to Calendar
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}
