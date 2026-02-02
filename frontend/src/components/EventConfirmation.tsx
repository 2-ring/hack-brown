import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Equals as EqualsIcon, PencilSimple as EditIcon, PaperPlaneRight as SendIcon, X as XIcon, CheckFat as CheckIcon, ChatCircleDots as ChatIcon } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'
import { toast } from 'sonner'
import type { CalendarEvent } from '../types/calendarEvent'
import type { LoadingStateConfig } from '../types/loadingState'
import wordmarkImage from '../assets/Wordmark.png'
import './EventConfirmation.css'

interface EventConfirmationProps {
  events: (CalendarEvent | null)[]
  onConfirm?: () => void
  isLoading?: boolean
  loadingConfig?: LoadingStateConfig[]
  expectedEventCount?: number
}

export function EventConfirmation({ events, onConfirm, isLoading = false, loadingConfig = [], expectedEventCount }: EventConfirmationProps) {
  const [changeRequest, setChangeRequest] = useState('')
  const [isChatExpanded, setIsChatExpanded] = useState(false)
  const [editingField, setEditingField] = useState<{ eventIndex: number; field: 'summary' | 'date' | 'description' } | null>(null)
  const [editedEvents, setEditedEvents] = useState<(CalendarEvent | null)[]>(events)
  const [isProcessingEdit, setIsProcessingEdit] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync editedEvents with events prop
  useEffect(() => {
    setEditedEvents(events)
  }, [events])

  // Focus input when editing starts and position cursor at end
  useEffect(() => {
    if (editingField && inputRef.current) {
      const input = inputRef.current
      input.focus()
      // Set cursor position to end
      const length = input.value.length
      input.setSelectionRange(length, length)
    }
  }, [editingField])

  const handleEditClick = (eventIndex: number, field: 'summary' | 'date' | 'description', e?: React.MouseEvent) => {
    // Don't start editing if clicking on an input that's already being edited
    if (e?.target instanceof HTMLInputElement) {
      return
    }
    setEditingField({ eventIndex, field })
  }

  const handleEditChange = (eventIndex: number, field: string, value: string) => {
    setEditedEvents(prev => {
      const updated = [...prev]
      const event = updated[eventIndex]
      if (event) {
        updated[eventIndex] = {
          ...event,
          [field]: value
        }
      }
      return updated
    })
  }

  const handleEditBlur = () => {
    setEditingField(null)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      setEditingField(null)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditingField(null)
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
      {/* Fixed Header */}
      <div className="event-confirmation-header">
        <div className="header-left">
          <span>Google Calendar</span>
        </div>
        <div className="header-center">
          <img src={wordmarkImage} alt="DropCal" className="header-wordmark" />
        </div>
        <div className="header-right">
          {isLoading && expectedEventCount === undefined ? (
            <Skeleton width={80} height={20} />
          ) : (
            <span>{isLoading ? expectedEventCount : events.filter(e => e !== null).length} {(isLoading ? expectedEventCount : events.filter(e => e !== null).length) === 1 ? 'event' : 'events'}</span>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="event-confirmation-content">
        <div className="event-confirmation-list">
          {isLoading ? (
            // Streaming state - show skeleton for null events, actual cards for completed events
            Array.from({ length: expectedEventCount || 3 }).map((_, index) => {
              const event = events[index]

              if (event) {
                // Event is complete - show actual card
                const editedEvent = editedEvents[index] || event
                return (
                  <motion.div
                    key={`event-${index}`}
                    className="event-confirmation-card"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  >
                    <div className="event-confirmation-card-row">
                      <div className="editable-content-wrapper" onClick={(e) => handleEditClick(index, 'summary', e)}>
                        {editingField?.eventIndex === index && editingField?.field === 'summary' ? (
                          <input
                            ref={inputRef}
                            type="text"
                            className="event-confirmation-card-title editable-input"
                            value={editedEvent.summary}
                            onChange={(e) => handleEditChange(index, 'summary', e.target.value)}
                            onBlur={handleEditBlur}
                            onKeyDown={handleEditKeyDown}
                          />
                        ) : (
                          <div className="event-confirmation-card-title">
                            {editedEvent.summary}
                          </div>
                        )}
                        <EditIcon
                          size={16}
                          weight="regular"
                          className="edit-icon"
                        />
                      </div>
                    </div>
                    <div className="event-confirmation-card-row">
                      <div className="editable-content-wrapper" onClick={(e) => handleEditClick(index, 'date', e)}>
                        {editingField?.eventIndex === index && editingField?.field === 'date' ? (
                          <input
                            ref={inputRef}
                            type="text"
                            className="event-confirmation-card-date editable-input"
                            value={formatDate(editedEvent.start.dateTime, editedEvent.end.dateTime)}
                            onChange={(e) => handleEditChange(index, 'date', e.target.value)}
                            onBlur={handleEditBlur}
                            onKeyDown={handleEditKeyDown}
                          />
                        ) : (
                          <div className="event-confirmation-card-date">
                            {formatDate(editedEvent.start.dateTime, editedEvent.end.dateTime)}
                          </div>
                        )}
                        <EditIcon
                          size={14}
                          weight="regular"
                          className="edit-icon"
                        />
                      </div>
                    </div>
                    <div className="event-confirmation-card-row">
                      <div className="event-confirmation-card-description">
                        <EqualsIcon size={16} weight="bold" className="description-icon" />
                        <div className="editable-content-wrapper" onClick={(e) => handleEditClick(index, 'description', e)}>
                          {editingField?.eventIndex === index && editingField?.field === 'description' ? (
                            <input
                              ref={inputRef}
                              type="text"
                              className="editable-input description-input"
                              value={buildDescription(editedEvent)}
                              onChange={(e) => handleEditChange(index, 'description', e.target.value)}
                              onBlur={handleEditBlur}
                              onKeyDown={handleEditKeyDown}
                            />
                          ) : (
                            <span>{buildDescription(editedEvent)}</span>
                          )}
                          <EditIcon
                            size={14}
                            weight="regular"
                            className="edit-icon"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              } else {
                // Event not yet complete - show skeleton
                return (
                  <motion.div
                    key={`skeleton-${index}`}
                    className="event-confirmation-card skeleton-card"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <Skeleton height={28} borderRadius={8} style={{ marginBottom: '12px' }} />
                    <Skeleton height={20} width="60%" borderRadius={8} style={{ marginBottom: '12px' }} />
                    <Skeleton count={2} height={18} borderRadius={8} />
                  </motion.div>
                )
              }
            })
          ) : (
            // Complete state - show only actual events (filter out nulls)
            editedEvents.filter((event): event is CalendarEvent => event !== null).map((event, index) => (
              <motion.div
                key={index}
                className="event-confirmation-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <div className="event-confirmation-card-row">
                  <div className="editable-content-wrapper" onClick={(e) => handleEditClick(index, 'summary', e)}>
                    {editingField?.eventIndex === index && editingField?.field === 'summary' ? (
                      <input
                        ref={inputRef}
                        type="text"
                        className="event-confirmation-card-title editable-input"
                        value={event.summary}
                        onChange={(e) => handleEditChange(index, 'summary', e.target.value)}
                        onBlur={handleEditBlur}
                        onKeyDown={handleEditKeyDown}
                      />
                    ) : (
                      <div className="event-confirmation-card-title">
                        {event.summary}
                      </div>
                    )}
                    <EditIcon
                      size={16}
                      weight="regular"
                      className="edit-icon"
                    />
                  </div>
                </div>
                <div className="event-confirmation-card-row">
                  <div className="editable-content-wrapper" onClick={(e) => handleEditClick(index, 'date', e)}>
                    {editingField?.eventIndex === index && editingField?.field === 'date' ? (
                      <input
                        ref={inputRef}
                        type="text"
                        className="event-confirmation-card-date editable-input"
                        value={formatDate(event.start.dateTime, event.end.dateTime)}
                        onChange={(e) => handleEditChange(index, 'date', e.target.value)}
                        onBlur={handleEditBlur}
                        onKeyDown={handleEditKeyDown}
                      />
                    ) : (
                      <div className="event-confirmation-card-date">
                        {formatDate(event.start.dateTime, event.end.dateTime)}
                      </div>
                    )}
                    <EditIcon
                      size={14}
                      weight="regular"
                      className="edit-icon"
                    />
                  </div>
                </div>
                <div className="event-confirmation-card-row">
                  <div className="event-confirmation-card-description">
                    <EqualsIcon size={16} weight="bold" className="description-icon" />
                    <div className="editable-content-wrapper" onClick={(e) => handleEditClick(index, 'description', e)}>
                      {editingField?.eventIndex === index && editingField?.field === 'description' ? (
                        <input
                          ref={inputRef}
                          type="text"
                          className="editable-input description-input"
                          value={buildDescription(event)}
                          onChange={(e) => handleEditChange(index, 'description', e.target.value)}
                          onBlur={handleEditBlur}
                          onKeyDown={handleEditKeyDown}
                        />
                      ) : (
                        <span>{buildDescription(event)}</span>
                      )}
                      <EditIcon
                        size={14}
                        weight="regular"
                        className="edit-icon"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Fixed Footer with gradient overlay */}
      <div className="event-confirmation-footer-overlay">
        <div className="event-confirmation-footer">
          {isLoading ? (
            /* Progress indicators during loading */
            <div className="loading-progress-container">
              <div className="loading-progress-steps">
                {loadingConfig.map((config, index) => {
                  const IconComponent = config.icon
                  return (
                    <motion.div
                      key={index}
                      className="loading-progress-step"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                    >
                      {IconComponent && (
                        <div className="loading-progress-icon">
                          <IconComponent size={20} weight="bold" />
                        </div>
                      )}
                      <div className="loading-progress-text">
                        <div className="loading-progress-message" style={{ fontStyle: 'italic' }}>{config.message}</div>
                        {config.submessage && (
                          <div className="loading-progress-submessage">{config.submessage}</div>
                        )}
                      </div>
                      {config.count && (
                        <div className="loading-progress-count">{config.count}</div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Single row with cancel, chat input, and confirm buttons */
            <div className="event-confirmation-footer-row">
              <AnimatePresence mode="wait">
                {isChatExpanded ? (
                  <motion.div
                    key="chat-expanded"
                    className="event-confirmation-footer-content"
                    initial={{
                      y: 20,
                      scale: 0.95,
                      opacity: 0
                    }}
                    animate={{
                      y: 0,
                      scale: 1,
                      opacity: 1
                    }}
                    exit={{
                      y: -20,
                      scale: 0.95,
                      opacity: 0
                    }}
                    transition={{
                      duration: 0.3,
                      ease: [0.22, 1, 0.36, 1]
                    }}
                  >
                    <button
                      className="event-confirmation-icon-button cancel"
                      onClick={() => setIsChatExpanded(false)}
                      title="Close"
                    >
                      <XIcon size={20} weight="bold" />
                    </button>

                    <div className="event-confirmation-chat">
                      <input
                        type="text"
                        className="event-confirmation-chat-input"
                        placeholder="Request changes..."
                        value={changeRequest}
                        onChange={(e) => setChangeRequest(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                      />
                      <button
                        className="event-confirmation-chat-send"
                        onClick={handleSendRequest}
                        disabled={!changeRequest.trim() || isProcessingEdit}
                      >
                        <SendIcon size={20} weight="fill" />
                      </button>
                    </div>

                    {onConfirm && (
                      <button
                        className="event-confirmation-icon-button confirm"
                        onClick={onConfirm}
                        title="Add to Calendar"
                      >
                        <CheckIcon size={24} weight="bold" />
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="chat-collapsed"
                    className="event-confirmation-footer-content"
                    initial={{
                      y: 20,
                      scale: 0.95,
                      opacity: 0
                    }}
                    animate={{
                      y: 0,
                      scale: 1,
                      opacity: 1
                    }}
                    exit={{
                      y: -20,
                      scale: 0.95,
                      opacity: 0
                    }}
                    transition={{
                      duration: 0.3,
                      ease: [0.22, 1, 0.36, 1]
                    }}
                  >
                    <button
                      className="event-confirmation-request-button"
                      onClick={() => setIsChatExpanded(true)}
                    >
                      <ChatIcon size={18} weight="bold" />
                      <span>Request changes</span>
                    </button>

                    {onConfirm && (
                      <button
                        className="event-confirmation-icon-button confirm"
                        onClick={onConfirm}
                        title="Add to Calendar"
                      >
                        <CheckIcon size={24} weight="bold" />
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
