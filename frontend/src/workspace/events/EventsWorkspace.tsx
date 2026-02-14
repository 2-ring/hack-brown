import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import 'react-loading-skeleton/dist/skeleton.css'
import type { CalendarEvent } from './types'
import type { LoadingStateConfig } from './types'
import { LOADING_MESSAGES, getEffectiveDateTime } from './types'
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
import { updateEvent, deleteEvent, pushEvents, getSessionEvents, checkEventConflicts } from '../../api/backend-client'
import type { ConflictInfo } from '../../api/backend-client'
import type { SyncCalendar } from '../../api/sync'
import {
  useNotificationQueue,
  createSuccessNotification,
  createWarningNotification,
  createErrorNotification,
  getFriendlyErrorMessage,
} from '../input/notifications'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const DEFAULT_CALENDARS: SyncCalendar[] = [{
  id: 'primary',
  summary: 'Primary',
  backgroundColor: '#1170C5',
  primary: true,
}]

interface EventsWorkspaceProps {
  events: (CalendarEvent | null)[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onConfirm?: (editedEvents?: CalendarEvent[]) => Promise<any> | any
  onEventDeleted?: (eventId: string, sessionId?: string, remainingCount?: number) => void
  onEventsChanged?: (events: CalendarEvent[]) => void
  isLoading?: boolean
  loadingConfig?: LoadingStateConfig[]
  expectedEventCount?: number
  inputType?: 'text' | 'image' | 'audio' | 'document' | 'pdf' | 'email'
  inputContent?: string
  onBack?: () => void
  sessionId?: string
  calendars?: SyncCalendar[]
}

export function EventsWorkspace({ events, onConfirm, onEventDeleted, onEventsChanged, isLoading = false, loadingConfig = [], expectedEventCount, inputType, inputContent, onBack, sessionId, calendars: propCalendars }: EventsWorkspaceProps) {
  const [changeRequest, setChangeRequest] = useState('')
  const [isChatExpanded, setIsChatExpanded] = useState(false)
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(null)
  const [editedEvents, setEditedEvents] = useState<(CalendarEvent | null)[]>(events)
  const [activeLoading, setActiveLoading] = useState<LoadingStateConfig | null>(null)
  const [skeletonEventIds, setSkeletonEventIds] = useState<Set<string>>(new Set())
  const [isScrollable, setIsScrollable] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const pendingEditRef = useRef<CalendarEvent | null>(null)
  const { currentNotification, addNotification, dismissNotification } = useNotificationQueue()
  const [eventConflicts, setEventConflicts] = useState<Record<string, ConflictInfo[]>>({})

  const calendars = propCalendars && propCalendars.length > 0 ? propCalendars : DEFAULT_CALENDARS

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

  // Sync editedEvents from prop only when session changes or events first arrive
  const prevSessionIdRef = useRef(sessionId)
  useEffect(() => {
    const sessionChanged = sessionId !== prevSessionIdRef.current
    prevSessionIdRef.current = sessionId

    if (sessionChanged) {
      // New session — reset to prop data
      setEditedEvents(events)
    } else if (editedEvents.length === 0 && events.some(e => e !== null)) {
      // First batch of events arriving (pipeline streaming)
      setEditedEvents(events)
    } else if (isLoading) {
      // Still loading — keep syncing from prop (streaming events)
      setEditedEvents(events)
    }
  }, [events, sessionId, isLoading])

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
            const validEvents = updated.filter((e): e is CalendarEvent => e !== null)
            onEventsChanged?.(validEvents)
            return updated
          })
          addNotification(createSuccessNotification('Got it, changes saved!'))
        })
        .catch(err => {
          console.error('Failed to persist event edit:', err)
          addNotification(createErrorNotification("Couldn't save that change. Mind trying again?"))
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
    if (changeRequest.trim() && !activeLoading) {
      const instruction = changeRequest.trim()
      setChangeRequest('')
      setActiveLoading(LOADING_MESSAGES.APPLYING_EDITS)

      try {
        const validEvents = editedEvents.filter((e): e is CalendarEvent => e !== null)

        const calendarList = calendars.map(c => ({ id: c.id, name: c.summary }))

        const response = await fetch(`${API_URL}/edit-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: validEvents, instruction, calendars: calendarList }),
        })

        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || 'Edit request failed')
        }

        const result = await response.json()
        const actions: { index: number; action: 'edit' | 'delete'; edited_event?: CalendarEvent }[] = result.actions ?? []

        // Build updated events list by applying actions
        const deleteIndices = new Set<number>()
        const editMap = new Map<number, CalendarEvent>()

        for (const a of actions) {
          if (a.action === 'delete') {
            deleteIndices.add(a.index)
          } else if (a.action === 'edit' && a.edited_event) {
            // Carry over id/version/provider_syncs from original so persistence and sync badges work
            const original = validEvents[a.index]
            editMap.set(a.index, {
              ...a.edited_event,
              id: original?.id,
              provider_syncs: original?.provider_syncs,
              version: (original?.version ?? 1) + 1,
            })
          }
        }

        // Phase 1: Apply deletes immediately, show skeleton for edited events
        const affectedIds = new Set<string>()
        for (const [i] of editMap) {
          const id = validEvents[i]?.id
          if (id) affectedIds.add(id)
        }

        // Remove deleted events right away
        const afterDeletes = validEvents.filter((_, i) => !deleteIndices.has(i))
        setEditedEvents(afterDeletes)
        setActiveLoading(null)
        setIsChatExpanded(false)

        if (affectedIds.size > 0) {
          // Show skeleton for edited events briefly
          setSkeletonEventIds(affectedIds)

          // Phase 2: After a short delay, swap in the real edited data
          setTimeout(() => {
            setEditedEvents(prev => {
              const updated = prev.map(event => {
                if (!event?.id) return event
                // Find the edited version by matching id
                for (const [, edited] of editMap) {
                  if (edited.id === event.id) return edited
                }
                return event
              })
              const valid = updated.filter((e): e is CalendarEvent => e !== null)
              onEventsChanged?.(valid)
              return updated
            })
            setSkeletonEventIds(new Set())
          }, 400)
        } else {
          onEventsChanged?.(afterDeletes.filter((e): e is CalendarEvent => e !== null))
        }

        // Persist edits
        for (const [i, edited] of editMap) {
          const original = validEvents[i]
          if (original?.id) {
            updateEvent(original.id, edited)
              .then(persisted => {
                setEditedEvents(prev => {
                  const updated = prev.map(e => e?.id === persisted.id ? persisted : e)
                  const valid = updated.filter((e): e is CalendarEvent => e !== null)
                  onEventsChanged?.(valid)
                  return updated
                })
              })
              .catch(err => console.error('Failed to persist AI edit:', err))
          }
        }

        // Persist deletes
        for (const i of deleteIndices) {
          const original = validEvents[i]
          if (original?.id) {
            deleteEvent(original.id)
              .then(res => onEventDeleted?.(original.id!, res.session_id, res.remaining_event_count))
              .catch(err => console.error('Failed to persist AI delete:', err))
          }
        }

        addNotification(createSuccessNotification(result.message || 'Done, changes applied!'))
        runConflictCheck()
      } catch (error) {
        addNotification(createErrorNotification(getFriendlyErrorMessage(error)))
      } finally {
        setActiveLoading(null)
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
      setActiveLoading(LOADING_MESSAGES.ADDING_TO_CALENDAR)
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
            onEventsChanged?.(freshEvents)
          } catch {
            // Non-critical — local state is still usable
          }
        }
      } catch (error) {
        addNotification(createErrorNotification(getFriendlyErrorMessage(error)))
      } finally {
        setActiveLoading(null)
      }
    }
  }

  // Swipe right: push single event to calendar (create or update)
  const handleSwipeAdd = async (event: CalendarEvent) => {
    if (!event.id) return
    setActiveLoading(LOADING_MESSAGES.ADDING_TO_CALENDAR)
    try {
      const result = await pushEvents([event.id])
      if (result.created.includes(event.id)) {
        addNotification(createSuccessNotification(`"${event.summary}" added to your calendar!`))
      } else if (result.updated.includes(event.id)) {
        addNotification(createSuccessNotification(`"${event.summary}" updated in your calendar!`))
      } else if (result.skipped.includes(event.id)) {
        addNotification(createSuccessNotification(`"${event.summary}" is already up to date!`))
      } else {
        addNotification(createErrorNotification(`Hmm, couldn't sync "${event.summary}". Give it another try!`))
      }
      // Re-fetch events to get updated provider_syncs (badges update)
      if (sessionId) {
        try {
          const freshEvents = await getSessionEvents(sessionId)
          setEditedEvents(freshEvents)
          onEventsChanged?.(freshEvents)
        } catch {
          // Non-critical — local state is still usable
        }
      }
    } catch (error) {
      addNotification(createErrorNotification(getFriendlyErrorMessage(error)))
    } finally {
      setActiveLoading(null)
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
        addNotification(createErrorNotification(getFriendlyErrorMessage(error)))
        return
      }
    }

    addNotification(createSuccessNotification(`"${event.summary}" removed!`))
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


  const getCalendarColor = (calendarId: string | undefined): string => {
    // null/undefined = primary calendar
    if (!calendarId) {
      const primary = calendars.find(cal => cal.primary)
      return primary?.backgroundColor || '#1170C5'
    }

    const calendar = calendars.find(cal => cal.id === calendarId)
    return calendar?.backgroundColor || '#1170C5'
  }


  // Detect date context for all events to determine optimal display format
  // Group events by date
  const groupEventsByDate = (events: CalendarEvent[]): Map<string, CalendarEvent[]> => {
    const grouped = new Map<string, CalendarEvent[]>()

    events.forEach(event => {
      const dateStr = getEffectiveDateTime(event.start)
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return
      // Use date string as key (YYYY-MM-DD)
      const dateKey = date.toISOString().split('T')[0]

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, [])
      }
      grouped.get(dateKey)!.push(event)
    })

    // Sort events within each date by start time
    grouped.forEach((events) => {
      events.sort((a, b) => new Date(getEffectiveDateTime(a.start)).getTime() - new Date(getEffectiveDateTime(b.start)).getTime())
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
                              isLoading={!!(event.id && skeletonEventIds.has(event.id))}
        
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
        isLoading={isLoading || activeLoading !== null}
        loadingConfig={activeLoading ? [activeLoading] : loadingConfig}
        notification={currentNotification}
        onDismissNotification={dismissNotification}
        isEditingEvent={editingEventIndex !== null}
        isChatExpanded={isChatExpanded}
        changeRequest={changeRequest}
        isProcessingEdit={activeLoading !== null}
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
