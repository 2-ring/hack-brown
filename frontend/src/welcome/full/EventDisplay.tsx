import { MapPin as LocationIcon, Clock as ClockIcon } from '@phosphor-icons/react'
import './EventDisplay.css'

interface DisplayEvent {
  title: string
  time: string
  location?: string
  color: string
}

/**
 * Event display component showing calendar events on the right
 */
export function EventDisplay() {
  const events: DisplayEvent[] = [
    {
      title: 'Team Meeting',
      time: '2:00 PM - 3:00 PM',
      location: 'Conference Room A',
      color: '#7C3AED',
    },
    {
      title: 'CS Lecture',
      time: '10:00 AM - 11:30 AM',
      location: 'CIT 165',
      color: '#059669',
    },
    {
      title: 'Coffee Chat',
      time: '4:00 PM - 5:00 PM',
      location: 'Blue Room',
      color: '#1170C5',
    },
  ]

  return (
    <div className="event-display">
      {events.map((event, index) => (
        <div key={index} className="event-display-card" style={{ borderLeftColor: event.color }}>
          <div className="event-display-title">{event.title}</div>
          <div className="event-display-meta">
            <ClockIcon size={14} weight="bold" />
            <span>{event.time}</span>
          </div>
          {event.location && (
            <div className="event-display-meta">
              <LocationIcon size={14} weight="bold" />
              <span>{event.location}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
