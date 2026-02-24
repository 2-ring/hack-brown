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
import { getEffectiveDateTime, isAllDay as checkIsAllDay } from './types'
import { editViewVariants, editSectionVariants } from './animations'
import { TimeInput, DateInput, TimezoneInput, BottomDrawer } from './inputs'
import { useViewport } from '../input/shared/hooks/useViewport'
import {
  parseRRule, buildRRule, formatConfig, getDefaultConfig,
  type RecurrenceConfig, type RecurrenceFrequency, type DayCode, type EndType,
  ALL_DAYS, DAY_SHORT, FREQUENCY_LABELS,
} from './recurrence'
import type { SyncCalendar } from '../../api/sync'
import './EventEditView.css'

interface EventEditViewProps {
  event: CalendarEvent
  calendars: SyncCalendar[]
  isLoadingCalendars?: boolean
  onClose: () => void
  onSave: (event: CalendarEvent) => void
  onChange?: (event: CalendarEvent) => void
  getCalendarColor: (calendarId: string | undefined) => string
}

type EditableField = 'summary' | 'location' | 'description' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timezone' | 'repeat' | 'recurrenceEndDate'

export function EventEditView({
  event,
  calendars,
  isLoadingCalendars = false,
  onClose: _onClose,
  onSave: _onSave,
  onChange,
  getCalendarColor: _getCalendarColor,
}: EventEditViewProps) {
  const [editedEvent, setEditedEvent] = useState<CalendarEvent>(event)
  const [isAllDay, setIsAllDay] = useState(() => checkIsAllDay(event.start))
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [showRecurrenceEditor, setShowRecurrenceEditor] = useState(false)
  const [recurrenceConfig, setRecurrenceConfig] = useState<RecurrenceConfig | null>(() => {
    if (event.recurrence && event.recurrence.length > 0) {
      return parseRRule(event.recurrence)
    }
    return null
  })
  const { isMobile } = useViewport()
  const calendarScrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const handleChange = (field: keyof CalendarEvent, value: any) => {
    setEditedEvent(prev => {
      const updated = { ...prev, [field]: value }
      onChange?.(updated)
      return updated
    })
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

  const handleCalendarSelect = (calendar: SyncCalendar) => {
    // null = primary/default calendar, only store ID for non-primary
    handleChange('calendar', calendar.primary ? null : calendar.id)
  }

  const handleFrequencySelect = (freq: RecurrenceFrequency | 'NONE') => {
    if (freq === 'NONE') {
      setRecurrenceConfig(null)
      setShowRecurrenceEditor(false)
      handleChange('recurrence', null)
      return
    }
    const config = getDefaultConfig(freq, getEffectiveDateTime(editedEvent.start))
    setRecurrenceConfig(config)
    setShowRecurrenceEditor(true)
    handleChange('recurrence', buildRRule(config))
  }

  const updateRecurrence = (updates: Partial<RecurrenceConfig>) => {
    setRecurrenceConfig(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      handleChange('recurrence', buildRRule(updated))
      return updated
    })
  }

  const toggleDay = (day: DayCode) => {
    if (!recurrenceConfig) return
    const days = recurrenceConfig.days.includes(day)
      ? recurrenceConfig.days.filter(d => d !== day)
      : [...recurrenceConfig.days, day].sort((a, b) => ALL_DAYS.indexOf(a) - ALL_DAYS.indexOf(b))
    // Keep at least one day selected
    if (days.length === 0) return
    updateRecurrence({ days })
  }

  const recurrenceLabel = recurrenceConfig
    ? formatConfig(recurrenceConfig)
    : 'Does not repeat'

  const recurrenceEditorContent = (
    <div className="recurrence-editor">
      {/* Frequency Chips */}
      <div className="recurrence-frequency-chips">
        {(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map(freq => {
          const isActive = freq === 'NONE' ? !recurrenceConfig : recurrenceConfig?.frequency === freq
          return (
            <button
              key={freq}
              className={`recurrence-chip ${isActive ? 'active' : ''}`}
              onClick={() => handleFrequencySelect(freq as RecurrenceFrequency | 'NONE')}
            >
              {freq === 'NONE' ? 'None' : FREQUENCY_LABELS[freq]}
            </button>
          )
        })}
      </div>

      {recurrenceConfig && (
        <>
          {/* Interval */}
          <div className="recurrence-interval-row">
            <span className="recurrence-label">Every</span>
            <input
              type="number"
              min={1}
              max={99}
              className="recurrence-interval-input"
              value={recurrenceConfig.interval}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (val >= 1 && val <= 99) updateRecurrence({ interval: val })
              }}
            />
            <span className="recurrence-label">
              {{
                DAILY: recurrenceConfig.interval === 1 ? 'day' : 'days',
                WEEKLY: recurrenceConfig.interval === 1 ? 'week' : 'weeks',
                MONTHLY: recurrenceConfig.interval === 1 ? 'month' : 'months',
                YEARLY: recurrenceConfig.interval === 1 ? 'year' : 'years',
              }[recurrenceConfig.frequency]}
            </span>
          </div>

          {/* Day Picker (weekly only) */}
          {recurrenceConfig.frequency === 'WEEKLY' && (
            <div className="recurrence-day-picker">
              {ALL_DAYS.map(day => (
                <button
                  key={day}
                  className={`recurrence-day-chip ${recurrenceConfig.days.includes(day) ? 'active' : ''}`}
                  onClick={() => toggleDay(day)}
                >
                  {DAY_SHORT[day]}
                </button>
              ))}
            </div>
          )}

          {/* Monthly day */}
          {recurrenceConfig.frequency === 'MONTHLY' && (
            <div className="recurrence-interval-row">
              <span className="recurrence-label">On day</span>
              <input
                type="number"
                min={1}
                max={31}
                className="recurrence-interval-input"
                value={recurrenceConfig.monthDay || 1}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  if (val >= 1 && val <= 31) updateRecurrence({ monthDay: val })
                }}
              />
            </div>
          )}

          {/* End Condition */}
          <div className="recurrence-end-section">
            <span className="recurrence-label">Ends</span>
            <div className="recurrence-end-chips">
              {(['never', 'until', 'count'] as EndType[]).map(endType => (
                <button
                  key={endType}
                  className={`recurrence-chip ${recurrenceConfig.endType === endType ? 'active' : ''}`}
                  onClick={() => updateRecurrence({ endType })}
                >
                  {{ never: 'Never', until: 'On date', count: 'After' }[endType]}
                </button>
              ))}
            </div>

            {recurrenceConfig.endType === 'until' && (
              <div className="recurrence-end-value">
                <div className="recurrence-date-wrapper" onClick={(e) => handleEditClick('recurrenceEndDate', e)}>
                  <DateInput
                    value={recurrenceConfig.endDate ? new Date(recurrenceConfig.endDate + 'T00:00:00').toISOString() : new Date().toISOString()}
                    onChange={(isoString) => {
                      const d = new Date(isoString)
                      const yyyy = d.getFullYear()
                      const mm = String(d.getMonth() + 1).padStart(2, '0')
                      const dd = String(d.getDate()).padStart(2, '0')
                      updateRecurrence({ endDate: `${yyyy}-${mm}-${dd}` })
                    }}
                    onFocus={() => setEditingField('recurrenceEndDate')}
                    onBlur={handleEditBlur}
                    isEditing={editingField === 'recurrenceEndDate'}
                    className="date-text"
                  />
                </div>
              </div>
            )}

            {recurrenceConfig.endType === 'count' && (
              <div className="recurrence-end-value">
                <input
                  type="number"
                  min={1}
                  max={999}
                  className="recurrence-interval-input"
                  value={recurrenceConfig.count || 10}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (val >= 1 && val <= 999) updateRecurrence({ count: val })
                  }}
                />
                <span className="recurrence-label">occurrences</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )

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
                [...calendars].sort((a, b) => {
                  if (a.primary && !b.primary) return -1
                  if (!a.primary && b.primary) return 1
                  return a.summary.localeCompare(b.summary)
                }).map((calendar) => {
                  // null/undefined calendar = primary (default)
                  const isSelected = editedEvent.calendar
                    ? calendar.id === editedEvent.calendar
                    : !!calendar.primary
                  return (
                  <button
                    key={calendar.id}
                    className={`calendar-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => handleCalendarSelect(calendar)}
                    style={{
                      backgroundColor: isSelected ? calendar.backgroundColor : 'transparent',
                      color: isSelected ? '#ffffff' : 'var(--text-primary)',
                      borderColor: calendar.backgroundColor
                    }}
                  >
                    <div
                      className="calendar-chip-dot"
                      style={{ backgroundColor: calendar.backgroundColor }}
                    />
                    <span>{calendar.summary}</span>
                  </button>
                  )
                })
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
                      <DateInput
                        value={getEffectiveDateTime(editedEvent.start)}
                        onChange={(newDate) => {
                          setEditedEvent(prev => {
                            const updated = { ...prev, start: { ...prev.start, dateTime: newDate } }
                            onChange?.(updated)
                            return updated
                          })
                        }}
                        onFocus={() => setEditingField('startDate')}
                        onBlur={handleEditBlur}
                        isEditing={editingField === 'startDate'}
                        className="date-text"
                      />
                    </div>
                    {!isAllDay && (
                      <div className="editable-content-wrapper" onClick={(e) => handleEditClick('startTime', e)}>
                        <TimeInput
                          value={getEffectiveDateTime(editedEvent.start)}
                          onChange={(newTime) => {
                            setEditedEvent(prev => {
                              const updated = { ...prev, start: { ...prev.start, dateTime: newTime } }
                              onChange?.(updated)
                              return updated
                            })
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
                      <DateInput
                        value={getEffectiveDateTime(editedEvent.end)}
                        onChange={(newDate) => {
                          setEditedEvent(prev => {
                            const updated = { ...prev, end: { ...prev.end, dateTime: newDate } }
                            onChange?.(updated)
                            return updated
                          })
                        }}
                        onFocus={() => setEditingField('endDate')}
                        onBlur={handleEditBlur}
                        isEditing={editingField === 'endDate'}
                        className="date-text"
                      />
                    </div>
                    {!isAllDay && (
                      <div className="editable-content-wrapper" onClick={(e) => handleEditClick('endTime', e)}>
                        <TimeInput
                          value={getEffectiveDateTime(editedEvent.end)}
                          onChange={(newTime) => {
                            setEditedEvent(prev => {
                              const updated = { ...prev, end: { ...prev.end, dateTime: newTime } }
                              onChange?.(updated)
                              return updated
                            })
                          }}
                          onFocus={() => setEditingField('endTime')}
                          onBlur={handleEditBlur}
                          isEditing={editingField === 'endTime'}
                          startTime={getEffectiveDateTime(editedEvent.start)}
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
                  <TimezoneInput
                    value={editedEvent.start.timeZone || 'America/New_York'}
                    onChange={(timezone) => {
                      setEditedEvent(prev => {
                        const updated = {
                          ...prev,
                          start: { ...prev.start, timeZone: timezone },
                          end: { ...prev.end, timeZone: timezone },
                        }
                        onChange?.(updated)
                        return updated
                      })
                    }}
                    onFocus={() => setEditingField('timezone')}
                    onBlur={handleEditBlur}
                    isEditing={editingField === 'timezone'}
                    className="date-text"
                  />
                </div>
              </div>
            </div>

            {/* Repeat Row */}
            <div className="event-edit-row no-border">
              <RepeatIcon size={20} weight="regular" className="row-icon" />
              <div className="row-content">
                <div
                  className="editable-content-wrapper"
                  onClick={() => setShowRecurrenceEditor(prev => !prev)}
                >
                  <span className="date-text">{recurrenceLabel}</span>
                </div>

                {/* Recurrence Editor — inline on desktop, drawer on mobile */}
                {isMobile ? (
                  <BottomDrawer isOpen={showRecurrenceEditor} onClose={() => setShowRecurrenceEditor(false)}>
                    {recurrenceEditorContent}
                  </BottomDrawer>
                ) : (
                  showRecurrenceEditor && recurrenceEditorContent
                )}
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
