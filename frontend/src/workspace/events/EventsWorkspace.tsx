import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import 'react-loading-skeleton/dist/skeleton.css'
import type { CalendarEvent } from './types'
import type { LoadingStateConfig } from './types'
import { LOADING_MESSAGES } from './types'
import { TopBar, BottomBar } from './Bar'
import { Event } from './Event'
import { SwipeableEvent } from './SwipeableEvent'
import { DateHeader, MonthHeader } from './DateHeader'
import { EventEditView } from './EventEditView'
import './EventsWorkspace.css'
import {
  listContainerVariants,
  eventItemVariants
} from './animations'
import { useAuth } from '../../auth/AuthContext'
import { getAccessToken } from '../../auth/supabase'
import { updateEvent, deleteEvent, syncEvent, getSessionEvents, checkEventConflicts, refreshGoogleCalendarTokens } from '../../api/backend-client'
import type { ConflictInfo } from '../../api/backend-client'
import {
  useNotificationQueue,
  createSuccessNotification,
  createWarningNotification,
  createErrorNotification,
} from '../input/notifications'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

interface GoogleCalendar {
  id: string
  summary: string
  backgroundColor: string
  foregroundColor?: string
  primary?: boolean
}

interface EventsWorkspaceProps {
  events: (CalendarEvent | null)[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onConfirm?: (editedEvents?: CalendarEvent[]) => Promise<any> | any
  onEventDeleted?: (eventId: string, sessionId?: string, remainingCount?: number) => void
  isLoading?: boolean
  loadingConfig?: LoadingStateConfig[]
  expectedEventCount?: number
  inputType?: 'text' | 'image' | 'audio' | 'document' | 'email'
  inputContent?: string
  onBack?: () => void
  sessionId?: string
}

export function EventsWorkspace({ events, onConfirm, onEventDeleted, isLoading = false, loadingConfig = [], expectedEventCount, inputType, inputContent, onBack, sessionId }: EventsWorkspaceProps) {
  const { calendarReady } = useAuth()
  const [changeRequest, setChangeRequest] = useState('')
  const [isChatExpanded, setIsChatExpanded] = useState(false)
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(null)
  const [editedEvents, setEditedEvents] = useState<(CalendarEvent | null)[]>(events)
  const [isProcessingEdit, setIsProcessingEdit] = useState(false)
  const [isAddingToCalendar, setIsAddingToCalendar] = useState(false)
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([])
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(true)
  const [isScrollable, setIsScrollable] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const pendingEditRef = useRef<CalendarEvent | null>(null)
  const { currentNotification, addNotification, dismissNotification } = useNotificationQueue()
  const [eventConflicts, setEventConflicts] = useState<Record<string, ConflictInfo[]>>({})

  const runConflictCheck = async () => {
    if (!sessionId) return
    const validEvents = editedEvents.filter((e): e is CalendarEvent => e !== null)
    if (validEvents.length === 0) return
    try {
      const conflicts = await checkEventConflicts(validEvents, sessionId)
      setEventConflicts(conflicts)
    } catch {
      // Silent failure — conflict checking is non-critical
    }
  }

  // Fetch calendar list once calendar tokens are ready
  useEffect(() => {
    if (!calendarReady) return

    const DEFAULT_CALENDAR: GoogleCalendar = {
      id: 'primary',
      summary: 'Primary',
      backgroundColor: '#1170C5',
      primary: true,
    }

    const fetchCalendarList = async (): Promise<GoogleCalendar[] | null> => {
      const token = await getAccessToken()
      const headers: HeadersInit = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const response = await fetch(`${API_URL}/api/calendar/list-calendars`, { headers })
      if (response.ok) {
        const data = await response.json()
        const fetched: GoogleCalendar[] = data.calendars || []
        if (!fetched.some(cal => cal.primary || cal.id === 'primary')) {
          fetched.unshift(DEFAULT_CALENDAR)
        }
        return fetched
      }
      if (response.status === 401) return null // signal to retry
      return [DEFAULT_CALENDAR]
    }

    const fetchCalendars = async () => {
      setIsLoadingCalendars(true)
      try {
        let result = await fetchCalendarList()

        // 401 — attempt silent token refresh then retry once
        if (result === null) {
          try {
            const refreshResult = await refreshGoogleCalendarTokens()
            if (refreshResult.refreshed) {
              result = await fetchCalendarList()
            }
          } catch {
            // Refresh attempt itself failed
          }

          // Still null after refresh attempt — notify user
          if (result === null) {
            addNotification(createWarningNotification(
              'Calendar session expired. Please sign in again to restore your calendars.'
            ))
            result = [DEFAULT_CALENDAR]
          }
        }

        setCalendars(result)
      } catch (error) {
        console.error('Failed to fetch calendars:', error)
        setCalendars([DEFAULT_CALENDAR])
      } finally {
        setIsLoadingCalendars(false)
      }
    }
    fetchCalendars()
  }, [calendarReady])

  // Sync editedEvents with events prop
  useEffect(() => {
    setEditedEvents(events)
  }, [events])

  // Check for conflicts when events finish loading
  useEffect(() => {
    if (!isLoading && editedEvents.some(e => e !== null)) {
      runConflictCheck()
    }
  }, [isLoading])

  // Check if content is scrollable
  useEffect(() => {
    const checkScrollable = () => {
      if (contentRef.current) {
        const hasOverflow = contentRef.current.scrollHeight > contentRef.current.clientHeight
        setIsScrollable(hasOverflow)
      }
    }

    // Use requestAnimationFrame to ensure DOM has updated
    // and add a small timeout to wait for animations to complete
    const rafId = requestAnimationFrame(() => {
      const timeoutId = setTimeout(checkScrollable, 100)
      return () => clearTimeout(timeoutId)
    })

    // Also check on window resize
    window.addEventListener('resize', checkScrollable)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', checkScrollable)
    }
  }, [events, editedEvents, isLoading, editingEventIndex])

  const handleEventClick = (eventIndex: number) => {
    pendingEditRef.current = null
    setEditingEventIndex(eventIndex)
  }

  const handleEditChange = (updatedEvent: CalendarEvent) => {
    pendingEditRef.current = updatedEvent
  }

  const handleSaveEdit = () => {
    flushPendingEdit()
    handleCloseEdit()
  }

  const flushPendingEdit = () => {
    if (pendingEditRef.current) {
      handleEventSave(pendingEditRef.current)
      pendingEditRef.current = null
    }
  }

  const handleEventSave = (updatedEvent: CalendarEvent) => {
    if (editingEventIndex === null) return

    // Optimistic local update — bump version so sync badge immediately shows "Edits applied"
    const savedIndex = editingEventIndex
    const optimisticEvent = {
      ...updatedEvent,
      version: (updatedEvent.version ?? 1) + 1,
    }
    setEditedEvents(prev => {
      const updated = [...prev]
      updated[savedIndex] = optimisticEvent
      return updated
    })

    runConflictCheck()

    // Persist to backend if event has an id (exists in events table)
    if (updatedEvent.id) {
      updateEvent(updatedEvent.id, updatedEvent)
        .then(persisted => {
          // Update with server response (has bumped version)
          setEditedEvents(prev => {
            const updated = [...prev]
            updated[savedIndex] = persisted
            return updated
          })
          addNotification(createSuccessNotification('Your changes have been saved'))
        })
        .catch(err => {
          console.error('Failed to persist event edit:', err)
          addNotification(createErrorNotification('Failed to save changes'))
        })
    }
  }

  const handleCloseEdit = () => {
    flushPendingEdit()
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

      try {
        // Send instruction to each event and let AI figure out which ones to modify
        const modifiedEvents = await Promise.all(
          editedEvents.map(async (event, index) => {
            if (!event) return null

            try {
              const response = await fetch(`${API_URL}/api/edit-event`, {
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

        // Persist modified events that have ids to backend
        for (const event of modifiedEvents) {
          if (event?.id) {
            updateEvent(event.id, event)
              .then(persisted => {
                setEditedEvents(prev =>
                  prev.map(e => e?.id === persisted.id ? persisted : e)
                )
              })
              .catch(err => console.error('Failed to persist AI edit:', err))
          }
        }

        addNotification(createSuccessNotification('Changes applied!'))
        runConflictCheck()

        // Close chat after successful edit
        setIsChatExpanded(false)
      } catch (error) {
        addNotification(createErrorNotification(
          error instanceof Error ? error.message : 'Failed to apply changes'
        ))
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

  // Wrap onConfirm to pass edited events and show loading in the bottom bar
  const handleConfirm = async () => {
    if (onConfirm) {
      const validEditedEvents = editedEvents.filter((e): e is CalendarEvent => e !== null)
      setIsAddingToCalendar(true)
      try {
        const result = await onConfirm(validEditedEvents)

        // Build notification from sync result
        if (result?.has_conflicts) {
          addNotification(createWarningNotification(
            `${result.message}`
          ))
        } else if (result?.message) {
          addNotification(createSuccessNotification(result.message))
        }

        // Re-fetch events to get updated provider_syncs/version (badges update)
        if (sessionId) {
          try {
            const freshEvents = await getSessionEvents(sessionId)
            setEditedEvents(freshEvents)
          } catch {
            // Non-critical — local state is still usable
          }
        }
      } catch (error) {
        addNotification(createErrorNotification(
          error instanceof Error ? error.message : 'Failed to sync to calendar'
        ))
      } finally {
        setIsAddingToCalendar(false)
      }
    }
  }

  // Swipe right: sync single event to calendar (create or update)
  const handleSwipeAdd = async (event: CalendarEvent) => {
    if (!event.id) return
    try {
      const result = await syncEvent(event.id)
      const action = result.action
      if (action === 'updated') {
        addNotification(createSuccessNotification(`"${event.summary}" updated in calendar`))
      } else if (action === 'skipped') {
        addNotification(createSuccessNotification(`"${event.summary}" already up to date`))
      } else if (action === 'created') {
        addNotification(createSuccessNotification(`"${event.summary}" added to calendar`))
      } else {
        addNotification(createErrorNotification(`Failed to sync "${event.summary}"`))
      }
      // Update local state with the fresh event from server (has updated provider_syncs)
      if (result.event) {
        setEditedEvents(prev => prev.map(e =>
          e?.id === event.id ? result.event : e
        ))
      }
    } catch (error) {
      addNotification(createErrorNotification(
        error instanceof Error ? error.message : 'Failed to sync event'
      ))
    }
  }

  // Swipe left: remove event
  const handleSwipeDelete = async (event: CalendarEvent) => {
    // Remove from local state immediately
    setEditedEvents(prev => prev.filter(e => e !== event))

    if (event.id) {
      try {
        const result = await deleteEvent(event.id)
        onEventDeleted?.(event.id, result.session_id, result.remaining_event_count)
      } catch (error) {
        // Re-add on failure
        setEditedEvents(prev => [...prev, event])
        addNotification(createErrorNotification(
          error instanceof Error ? error.message : 'Failed to remove event'
        ))
        return
      }
    }

    addNotification(createSuccessNotification(`"${event.summary}" removed`))
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

    // Find matching calendar by ID or name (case-insensitive)
    const calendar = calendars.find(cal =>
      cal.id === calendarName || cal.summary.toLowerCase() === calendarName.toLowerCase()
    )

    return calendar?.backgroundColor || '#1170C5'
  }


  // Detect date context for all events to determine optimal display format
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
        eventCount={events.filter(e => e !== null).length}
        isScrollable={isScrollable}
        inputType={inputType}
        inputContent={inputContent}
        onBack={onBack}
      />

      <div
        ref={contentRef}
        className="event-confirmation-content"
      >
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
              onChange={handleEditChange}
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
                      activeProvider="google"
                      conflictInfo={eventConflicts[String(index)]}
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
                          <SwipeableEvent
                            event={event}
                            activeProvider="google"
                            onSwipeRight={handleSwipeAdd}
                            onSwipeLeft={handleSwipeDelete}
                          >
                            <Event
                              event={event}
                              index={originalIndex}
                              isLoadingCalendars={isLoadingCalendars}
                              calendars={calendars}
                              formatDate={formatDate}
                              formatTime={formatTime}
                              formatTimeRange={formatTimeRange}
                              getCalendarColor={getCalendarColor}
                              activeProvider="google"
                              conflictInfo={eventConflicts[String(originalIndex)]}
                              onClick={() => handleEventClick(originalIndex)}
                            />
                          </SwipeableEvent>
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
        isLoading={isLoading || isAddingToCalendar}
        loadingConfig={isAddingToCalendar ? [LOADING_MESSAGES.ADDING_TO_CALENDAR] : loadingConfig}
        notification={currentNotification}
        onDismissNotification={dismissNotification}
        isEditingEvent={editingEventIndex !== null}
        isChatExpanded={isChatExpanded}
        changeRequest={changeRequest}
        isProcessingEdit={isProcessingEdit}
        onCancel={handleCancel}
        onRequestChanges={() => setIsChatExpanded(true)}
        onChangeRequestChange={setChangeRequest}
        onSend={handleSendRequest}
        onKeyDown={handleKeyDown}
        onConfirm={handleConfirm}
        onSave={handleSaveEdit}
        isScrollable={isScrollable}
      />
    </div>
  )
}
