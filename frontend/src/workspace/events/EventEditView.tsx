/**
 * EventEditView Component
 *
 * Displays an event editor with staggered section animations.
 *
 * Animation Structure:
 * - Container uses `editViewVariants` to control stagger timing
 * - Each section wraps content with `motion.div` using `editSectionVariants`
 * - Sections animate in sequence with ripple effect (scale + opacity + y movement)
 *
 * Current Sections (in order):
 * 1. Title - Event title input
 * 2. Calendar - Calendar selection chips
 * 3. Time - Date/time, timezone, and repeat settings
 * 4. Location - Location input
 * 5. Description - Description textarea
 *
 * To Add New Sections:
 * Simply wrap new content with: <motion.div variants={editSectionVariants}>
 * Position it where you want it in the render order to control animation timing.
 */

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import Skeleton from 'react-loading-skeleton'
import { Clock as ClockIcon, MapPin as LocationIcon, TextAlignLeft as DescriptionIcon, Globe as GlobeIcon, ArrowsClockwise as RepeatIcon } from '@phosphor-icons/react'
import type { CalendarEvent } from './types'
import { editViewVariants, editSectionVariants } from './animations'
import { TimeInput } from './inputs'
import './EventEditView.css'

interface GoogleCalendar {
  id: string
  summary: string
  backgroundColor: string
  foregroundColor?: string
  primary?: boolean
}

interface EventEditViewProps {
  event: CalendarEvent
  calendars: GoogleCalendar[]
  isLoadingCalendars?: boolean
  onClose: () => void
  onSave: (event: CalendarEvent) => void
  getCalendarColor: (calendarName: string | undefined) => string
}

type EditableField = 'summary' | 'location' | 'description' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timezone' | 'repeat'

export function EventEditView({
  event,
  calendars,
  isLoadingCalendars = false,
  onClose: _onClose,
  onSave: _onSave,
  getCalendarColor: _getCalendarColor,
}: EventEditViewProps) {
  const [editedEvent, setEditedEvent] = useState<CalendarEvent>(event)
  const [isAllDay, setIsAllDay] = useState(false)
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const calendarScrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const handleChange = (field: keyof CalendarEvent, value: any) => {
    setEditedEvent(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleEditClick = (field: EditableField, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setEditingField(field)

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        // Title: select all, others: cursor at end
        if (field === 'summary') {
          inputRef.current.select()
        } else {
          const length = inputRef.current.value.length
          inputRef.current.setSelectionRange(length, length)
        }
      }
    }, 0)
  }

  const handleEditBlur = () => {
    setEditingField(null)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      setEditingField(null)
    } else if (e.key === 'Escape') {
      setEditingField(null)
    }
  }

  const formatDateForDisplay = (dateTime: string) => {
    const date = new Date(dateTime)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTimeForDisplay = (dateTime: string) => {
    const date = new Date(dateTime)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const handleCalendarSelect = (calendarId: string) => {
    handleChange('calendar', calendarId)
  }

  return (
    <div className="event-edit-overlay">
      <motion.div
        className="event-edit-container"
        variants={editViewVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {/* Section 1: Title */}
        <motion.div variants={editSectionVariants} className="event-edit-header">
          <div className="editable-content-wrapper" onClick={(e) => handleEditClick('summary', e)}>
            {editingField === 'summary' ? (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                className="event-edit-title-input editable-input"
                value={editedEvent.summary}
                onChange={(e) => handleChange('summary', e.target.value)}
                onBlur={handleEditBlur}
                onKeyDown={handleEditKeyDown}
                placeholder="Add title"
              />
            ) : (
              <div className="event-edit-title-input">
                {editedEvent.summary || 'Add title'}
              </div>
            )}
          </div>
        </motion.div>

        {/* Scrollable Body */}
        <div className="event-edit-body">
          {/* Section 2: Calendar Selection */}
          <motion.div variants={editSectionVariants} className="event-edit-calendar-section">
            <div className="calendar-chips" ref={calendarScrollRef}>
              {isLoadingCalendars ? (
                // Show skeleton loaders with reducing opacity
                Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="calendar-chip-skeleton"
                    style={{ opacity: 1 - index * 0.3 }}
                  >
                    <Skeleton width={100} height={32} borderRadius={20} />
                  </div>
                ))
              ) : (
                calendars.map((calendar) => (
                  <button
                    key={calendar.id}
                    className={`calendar-chip ${calendar.id === editedEvent.calendar ? 'active' : ''}`}
                    onClick={() => handleCalendarSelect(calendar.id)}
                    style={{
                      backgroundColor: calendar.id === editedEvent.calendar ? calendar.backgroundColor : 'transparent',
                      color: calendar.id === editedEvent.calendar ? '#ffffff' : '#666',
                      borderColor: calendar.backgroundColor
                    }}
                  >
                    <div
                      className="calendar-chip-dot"
                      style={{ backgroundColor: calendar.backgroundColor }}
                    />
                    <span>{calendar.summary}</span>
                  </button>
                ))
              )}
            </div>
          </motion.div>

          {/* Section 3: Time (includes date, time, timezone, repeat) */}
          <motion.div variants={editSectionVariants}>
            {/* Date & Time Row */}
            <div className="event-edit-row">
              <ClockIcon size={20} weight="regular" className="row-icon" />
              <div className="row-content">
                <div className="time-row-group">
                  <div className="row-main">
                    <span className="date-text">All day</span>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={isAllDay}
                        onChange={(e) => setIsAllDay(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="row-main">
                    <div className="editable-content-wrapper" onClick={(e) => handleEditClick('startDate', e)}>
                      {editingField === 'startDate' ? (
                        <input
                          ref={inputRef as React.RefObject<HTMLInputElement>}
                          type="text"
                          className="date-text editable-input"
                          value={formatDateForDisplay(editedEvent.start.dateTime)}
                          onChange={(e) => {
                            // For now, just keep the display value
                            // TODO: Implement date parsing
                          }}
                          onBlur={handleEditBlur}
                          onKeyDown={handleEditKeyDown}
                        />
                      ) : (
                        <span className="date-text">{formatDateForDisplay(editedEvent.start.dateTime)}</span>
                      )}
                    </div>
                    {!isAllDay && (
                      <div className="editable-content-wrapper">
                        <TimeInput
                          value={editedEvent.start.dateTime}
                          onChange={(newTime) => {
                            setEditedEvent(prev => ({
                              ...prev,
                              start: {
                                ...prev.start,
                                dateTime: newTime
                              }
                            }))
                          }}
                          onFocus={() => setEditingField('startTime')}
                          onBlur={handleEditBlur}
                          isEditing={editingField === 'startTime'}
                          className="date-text"
                        />
                      </div>
                    )}
                  </div>
                  <div className="row-main">
                    <div className="editable-content-wrapper" onClick={(e) => handleEditClick('endDate', e)}>
                      {editingField === 'endDate' ? (
                        <input
                          ref={inputRef as React.RefObject<HTMLInputElement>}
                          type="text"
                          className="date-text editable-input"
                          value={formatDateForDisplay(editedEvent.end.dateTime)}
                          onChange={(e) => {
                            // For now, just keep the display value
                            // TODO: Implement date parsing
                          }}
                          onBlur={handleEditBlur}
                          onKeyDown={handleEditKeyDown}
                        />
                      ) : (
                        <span className="date-text">{formatDateForDisplay(editedEvent.end.dateTime)}</span>
                      )}
                    </div>
                    {!isAllDay && (
                      <div className="editable-content-wrapper">
                        <TimeInput
                          value={editedEvent.end.dateTime}
                          onChange={(newTime) => {
                            setEditedEvent(prev => ({
                              ...prev,
                              end: {
                                ...prev.end,
                                dateTime: newTime
                              }
                            }))
                          }}
                          onFocus={() => setEditingField('endTime')}
                          onBlur={handleEditBlur}
                          isEditing={editingField === 'endTime'}
                          className="date-text"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Timezone Row */}
            <div className="event-edit-row no-border">
              <GlobeIcon size={20} weight="regular" className="row-icon" />
              <div className="row-content">
                <div className="editable-content-wrapper" onClick={(e) => handleEditClick('timezone', e)}>
                  {editingField === 'timezone' ? (
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      type="text"
                      className="date-text editable-input"
                      value="Eastern Standard Time"
                      onChange={(e) => {
                        // TODO: Implement timezone handling
                      }}
                      onBlur={handleEditBlur}
                      onKeyDown={handleEditKeyDown}
                    />
                  ) : (
                    <span className="date-text">Eastern Standard Time</span>
                  )}
                </div>
              </div>
            </div>

            {/* Repeat Row */}
            <div className="event-edit-row no-border">
              <RepeatIcon size={20} weight="regular" className="row-icon" />
              <div className="row-content">
                <div className="editable-content-wrapper" onClick={(e) => handleEditClick('repeat', e)}>
                  {editingField === 'repeat' ? (
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      type="text"
                      className="date-text editable-input"
                      value="Does not repeat"
                      onChange={(e) => {
                        // TODO: Implement repeat handling
                      }}
                      onBlur={handleEditBlur}
                      onKeyDown={handleEditKeyDown}
                    />
                  ) : (
                    <span className="date-text">Does not repeat</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Section 4: Location */}
          <motion.div variants={editSectionVariants} className="event-edit-row">
            <LocationIcon size={20} weight="regular" className="row-icon" />
            <div className="row-content">
              <div className="editable-content-wrapper" onClick={(e) => handleEditClick('location', e)}>
                {editingField === 'location' ? (
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    className="row-input editable-input"
                    placeholder="Add location"
                    value={editedEvent.location || ''}
                    onChange={(e) => handleChange('location', e.target.value)}
                    onBlur={handleEditBlur}
                    onKeyDown={handleEditKeyDown}
                  />
                ) : (
                  <div className="row-input">
                    {editedEvent.location || 'Add location'}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Section 5: Description */}
          <motion.div variants={editSectionVariants} className="event-edit-row">
            <DescriptionIcon size={20} weight="regular" className="row-icon" />
            <div className="row-content">
              <div className="editable-content-wrapper" onClick={(e) => handleEditClick('description', e)}>
                {editingField === 'description' ? (
                  <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    className="row-textarea editable-input"
                    placeholder="Add description"
                    value={editedEvent.description || ''}
                    onChange={(e) => handleChange('description', e.target.value)}
                    onBlur={handleEditBlur}
                    onKeyDown={handleEditKeyDown}
                    rows={3}
                  />
                ) : (
                  <div className="row-textarea">
                    {editedEvent.description || 'Add description'}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
