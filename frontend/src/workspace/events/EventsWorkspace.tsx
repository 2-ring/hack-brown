import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import 'react-loading-skeleton/dist/skeleton.css'
import { toast } from 'sonner'
import type { CalendarEvent } from './types'
import type { LoadingStateConfig } from './types'
import { TopBar, BottomBar } from './Bar'
import { Event } from './Event'
import { DateHeader, MonthHeader } from './DateHeader'
import { EventEditView } from './EventEditView'
import wordmarkImage from '../../assets/Wordmark.png'
import './EventsWorkspace.css'
import {
  listContainerVariants,
  eventItemVariants,
  dateHeaderVariants
} from './animations'

interface GoogleCalendar {
  id: string
  summary: string
  backgroundColor: string
  foregroundColor?: string
  primary?: boolean
}

interface EventsWorkspaceProps {
  events: (CalendarEvent | null)[]
  onConfirm?: () => void
  isLoading?: boolean
  loadingConfig?: LoadingStateConfig[]
  expectedEventCount?: number
}

export function EventsWorkspace({ events, onConfirm, isLoading = false, loadingConfig = [], expectedEventCount }: EventsWorkspaceProps) {
  const [changeRequest, setChangeRequest] = useState('')
  const [isChatExpanded, setIsChatExpanded] = useState(false)
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(null)
  const [editedEvents, setEditedEvents] = useState<(CalendarEvent | null)[]>(events)
  const [isProcessingEdit, setIsProcessingEdit] = useState(false)
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([])
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(true)

  // Fetch calendar list on mount
  useEffect(() => {
    const fetchCalendars = async () => {
      setIsLoadingCalendars(true)
      try {
        const response = await fetch('http://localhost:5000/api/calendar/list-calendars')
        if (response.ok) {
          const data = await response.json()
          setCalendars(data.calendars || [])
        }
      } catch (error) {
        console.error('Failed to fetch calendars:', error)
      } finally {
        setIsLoadingCalendars(false)
      }
    }
    fetchCalendars()
  }, [])

  // Sync editedEvents with events prop
  useEffect(() => {
    setEditedEvents(events)
  }, [events])

  const handleEventClick = (eventIndex: number) => {
    setEditingEventIndex(eventIndex)
  }

  const handleEventSave = (updatedEvent: CalendarEvent) => {
    if (editingEventIndex === null) return

    setEditedEvents(prev => {
      const updated = [...prev]
      updated[editingEventIndex] = updatedEvent
      return updated
    })

    toast.success('Event updated', {
      description: 'Your changes have been saved',
      duration: 2000
    })
  }

  const handleCloseEdit = () => {
    setEditingEventIndex(null)
  }

  // Unified cancel handler
  const handleCancel = () => {
    if (editingEventIndex !== null && isChatExpanded) {
      // In editing-chat mode: close chat but stay in edit mode
      setIsChatExpanded(false)
      setChangeRequest('')
    } else if (editingEventIndex !== null) {
      // In editing mode: close edit
      handleCloseEdit()
    } else if (isChatExpanded) {
      // In chat mode: close chat
      setIsChatExpanded(false)
      setChangeRequest('')
    }
  }

  const handleSendRequest = async () => {
    if (changeRequest.trim() && !isProcessingEdit) {
      const instruction = changeRequest.trim()
      setChangeRequest('')
      setIsProcessingEdit(true)

      // Show loading toast
      const loadingToast = toast.loading('Processing changes...', {
        description: 'AI is analyzing your request'
      })

      try {
        // Send instruction to each event and let AI figure out which ones to modify
        const modifiedEvents = await Promise.all(
          editedEvents.map(async (event, index) => {
            if (!event) return null

            try {
              const response = await fetch('http://localhost:5000/api/edit-event', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  event: event,
                  instruction: instruction
                }),
              })

              if (!response.ok) {
                console.error(`Failed to edit event ${index}:`, await response.text())
                return event // Keep original if edit fails
              }

              const result = await response.json()
              return result.modified_event
            } catch (error) {
              console.error(`Error editing event ${index}:`, error)
              return event // Keep original on error
            }
          })
        )

        // Update state with modified events
        setEditedEvents(modifiedEvents)

        // Dismiss loading and show success
        toast.dismiss(loadingToast)
        toast.success('Changes applied!', {
          description: 'Events updated based on your request',
          duration: 3000
        })

        // Close chat after successful edit
        setIsChatExpanded(false)
      } catch (error) {
        // Dismiss loading and show error
        toast.dismiss(loadingToast)
        toast.error('Failed to apply changes', {
          description: error instanceof Error ? error.message : 'Unknown error',
          duration: 5000
        })
      } finally {
        setIsProcessingEdit(false)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendRequest()
    }
  }

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

  const formatTimeRange = (startDateTime: string, endDateTime: string): string => {
    const startTime = formatTime(startDateTime)
    const endTime = formatTime(endDateTime)

    if (startTime === endTime) {
      return startTime
    }

    return `${startTime} - ${endTime}`
  }


  const getCalendarColor = (calendarName: string | undefined): string => {
    if (!calendarName || calendarName === 'Primary' || calendarName === 'Default') {
      // Default color for primary calendar (Google Calendar blue)
      return '#1170C5'
    }

    // Test calendar colors (for demo purposes)
    const testCalendarColors: { [key: string]: string } = {
      'work': '#D50000',      // Red
      'school': '#F4511E',    // Deep Orange
      'personal': '#0B8043',  // Green
    }

    const testColor = testCalendarColors[calendarName.toLowerCase()]
    if (testColor) {
      return testColor
    }

    // Find matching calendar by name (case-insensitive)
    const calendar = calendars.find(cal =>
      cal.summary.toLowerCase() === calendarName.toLowerCase()
    )

    return calendar?.backgroundColor || '#1170C5'
  }


  // Detect date context for all events to determine optimal display format
  // TODO: Extend this to handle different scenarios:
  // - All events on same day: Show only time, no date headers
  // - All events in same month (current implementation): Show day-of-week + date number
  // - Events span multiple months: Show month abbreviation + date
  // - Events span multiple years: Include year in display
  const getDateContext = (events: CalendarEvent[]): {
    sameDay: boolean
    sameMonth: boolean
    sameYear: boolean
    currentYear: boolean
  } => {
    if (events.length === 0) {
      return { sameDay: true, sameMonth: true, sameYear: true, currentYear: true }
    }

    const dates = events.map(e => new Date(e.start.dateTime))
    const currentYear = new Date().getFullYear()

    // Check if all events are on the same day
    const firstDateStr = dates[0].toDateString()
    const sameDay = dates.every(d => d.toDateString() === firstDateStr)

    // Check if all events are in the same month
    const firstMonth = dates[0].getMonth()
    const firstYear = dates[0].getFullYear()
    const sameMonth = dates.every(d => d.getMonth() === firstMonth && d.getFullYear() === firstYear)

    // Check if all events are in the same year
    const sameYear = dates.every(d => d.getFullYear() === firstYear)

    // Check if all events are in the current year
    const currentYearCheck = dates.every(d => d.getFullYear() === currentYear)

    return { sameDay, sameMonth, sameYear, currentYear: currentYearCheck }
  }

  // Group events by date
  const groupEventsByDate = (events: CalendarEvent[]): Map<string, CalendarEvent[]> => {
    const grouped = new Map<string, CalendarEvent[]>()

    events.forEach(event => {
      const date = new Date(event.start.dateTime)
      // Use date string as key (YYYY-MM-DD)
      const dateKey = date.toISOString().split('T')[0]

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, [])
      }
      grouped.get(dateKey)!.push(event)
    })

    // Sort events within each date by start time
    grouped.forEach((events) => {
      events.sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime())
    })

    return grouped
  }

  return (
    <div className="event-confirmation">
      <TopBar
        wordmarkImage={wordmarkImage}
        eventCount={events.filter(e => e !== null).length}
        isLoading={isLoading}
        expectedEventCount={expectedEventCount}
        isLoadingCalendars={isLoadingCalendars}
        isEditingEvent={editingEventIndex !== null}
      />

      <div className="event-confirmation-content">
        <AnimatePresence mode="wait">
          {/* Event Edit View - Replaces event list when editing */}
          {editingEventIndex !== null && editedEvents[editingEventIndex] ? (
            <EventEditView
              key="edit-view"
              event={editedEvents[editingEventIndex]!}
              calendars={calendars}
              isLoadingCalendars={isLoadingCalendars}
              onClose={handleCloseEdit}
              onSave={handleEventSave}
              getCalendarColor={getCalendarColor}
            />
          ) : (
            <motion.div
              key="event-list"
              className="event-confirmation-list"
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
            {isLoading ? (
              // Streaming state - show skeleton for null events, actual cards for completed events
              Array.from({ length: expectedEventCount || 3 }).map((_, index) => {
                const event = events[index]
                const editedEvent = event ? (editedEvents[index] || event) : null

                // Calculate opacity for skeleton fade effect (like session list)
                const count = expectedEventCount || 3
                const skeletonOpacity = 1 - (index / count) * 0.7

                return (
                  <motion.div
                    key={event ? `event-${index}` : `skeleton-${index}`}
                    variants={eventItemVariants}
                  >
                    <Event
                      event={editedEvent}
                      index={index}
                      isLoading={!event}
                      isLoadingCalendars={isLoadingCalendars}
                      skeletonOpacity={skeletonOpacity}
                      calendars={calendars}
                      formatDate={formatDate}
                      formatTime={formatTime}
                      formatTimeRange={formatTimeRange}
                      getCalendarColor={getCalendarColor}
                      onClick={() => handleEventClick(index)}
                    />
                  </motion.div>
                )
              })
            ) : (
              // Complete state - group events by date and show with timing area layout
              (() => {
                const filteredEvents = editedEvents.filter((event): event is CalendarEvent => event !== null)
                const groupedEvents = groupEventsByDate(filteredEvents)

                // Sort date keys chronologically
                const sortedDateKeys = Array.from(groupedEvents.keys()).sort()

                // Render month header when month changes, followed by events
                const eventElements = sortedDateKeys.flatMap((dateKey, dateIndex) => {
                  const eventsForDate = groupedEvents.get(dateKey)!
                  const dateObj = new Date(dateKey + 'T00:00:00')

                  // Check if we need to show a month header (when month changes)
                  const prevDateKey = dateIndex > 0 ? sortedDateKeys[dateIndex - 1] : null
                  const prevDateObj = prevDateKey ? new Date(prevDateKey + 'T00:00:00') : null
                  const showMonthHeader = dateIndex === 0 ||
                    (prevDateObj && (prevDateObj.getMonth() !== dateObj.getMonth() || prevDateObj.getFullYear() !== dateObj.getFullYear()))

                  const monthHeaderElement = showMonthHeader ? (
                    <motion.div
                      key={`month-${dateKey}`}
                      variants={eventItemVariants}
                    >
                      <MonthHeader date={dateObj} />
                    </motion.div>
                  ) : null

                  const eventElements = eventsForDate.map((event, eventIndex) => {
                    // Find the original index for proper editing state management
                    const originalIndex = filteredEvents.indexOf(event)
                    const isFirstEventOfDay = eventIndex === 0

                    return (
                      <motion.div
                        key={`event-${dateKey}-${eventIndex}`}
                        className="event-date-group"
                        variants={eventItemVariants}
                      >
                        {/* Left: Timing area with circular date (only for first event) */}
                        <div className="event-date-timing-area">
                          {isFirstEventOfDay && <DateHeader date={dateObj} />}
                        </div>

                        {/* Right: Event card */}
                        <div className="event-date-event-single">
                          <Event
                            event={event}
                            index={originalIndex}
                            isLoadingCalendars={isLoadingCalendars}
                            calendars={calendars}
                            formatDate={formatDate}
                            formatTime={formatTime}
                            formatTimeRange={formatTimeRange}
                            getCalendarColor={getCalendarColor}
                            onClick={() => handleEventClick(originalIndex)}
                          />
                        </div>
                      </motion.div>
                    )
                  })

                  return monthHeaderElement ? [monthHeaderElement, ...eventElements] : eventElements
                })

                return eventElements
              })()
            )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BottomBar
        isLoading={isLoading}
        loadingConfig={loadingConfig}
        isEditingEvent={editingEventIndex !== null}
        isChatExpanded={isChatExpanded}
        changeRequest={changeRequest}
        isProcessingEdit={isProcessingEdit}
        onCancel={handleCancel}
        onRequestChanges={() => setIsChatExpanded(true)}
        onChangeRequestChange={setChangeRequest}
        onSend={handleSendRequest}
        onKeyDown={handleKeyDown}
        onConfirm={onConfirm}
      />
    </div>
  )
}
