/**
 * TimeInput Component
 *
 * Specialized time picker that adapts to mobile/desktop contexts.
 * Exports both desktop and mobile variants, with a unified interface.
 */

import { useState, useRef, useEffect } from 'react'
import './TimeInput.css'

export interface TimeInputProps {
  value: string // ISO datetime string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
}

/**
 * Desktop Time Input
 * Uses a dropdown with time suggestions and keyboard input
 */
export function TimeInputDesktop({ value, onChange, onBlur, placeholder, className }: TimeInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Format the datetime value for display
    if (value) {
      const date = new Date(value)
      setInputValue(date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }))
    }
  }, [value])

  // Generate time suggestions (every 15 minutes)
  const generateTimeSuggestions = () => {
    const times: { value: string; label: string }[] = []
    const baseDate = new Date(value)
    const today = new Date(baseDate.toDateString()) // Start of day

    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const time = new Date(today)
        time.setHours(hour, minute, 0, 0)

        // Calculate duration from current time for context
        const duration = Math.abs(time.getTime() - baseDate.getTime()) / (1000 * 60)
        const hours = Math.floor(duration / 60)
        const mins = duration % 60

        let durationText = ''
        if (hours > 0 && mins > 0) {
          durationText = ` (${hours} hr ${mins} mins)`
        } else if (hours > 0) {
          durationText = ` (${hours} hr)`
        } else if (mins > 0) {
          durationText = ` (${mins} mins)`
        }

        times.push({
          value: time.toISOString(),
          label: time.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }) + durationText
        })
      }
    }

    return times
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setIsOpen(true)
  }

  const handleTimeSelect = (timeValue: string) => {
    onChange(timeValue)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleInputBlur = () => {
    // Delay to allow click on dropdown
    setTimeout(() => {
      setIsOpen(false)
      onBlur?.()
    }, 200)
  }

  const handleInputFocus = () => {
    setIsOpen(true)
  }

  const timeSuggestions = generateTimeSuggestions()

  // Filter suggestions based on input
  const filteredSuggestions = inputValue
    ? timeSuggestions.filter(t =>
        t.label.toLowerCase().includes(inputValue.toLowerCase())
      )
    : timeSuggestions

  return (
    <div className={`time-input-container ${className || ''}`} ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        className="time-input"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder || 'Enter time'}
      />

      {isOpen && (
        <div className="time-dropdown">
          {filteredSuggestions.map((time, index) => (
            <button
              key={index}
              className="time-option"
              onClick={() => handleTimeSelect(time.value)}
              type="button"
            >
              {time.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Mobile Time Input
 * Uses native mobile time picker for better UX
 */
export function TimeInputMobile({ value, onChange, onBlur, placeholder, className }: TimeInputProps) {
  const [timeValue, setTimeValue] = useState('')

  useEffect(() => {
    // Format the datetime value for time input (HH:MM format)
    if (value) {
      const date = new Date(value)
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      setTimeValue(`${hours}:${minutes}`)
    }
  }, [value])

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value
    setTimeValue(newTime)

    // Parse time and update the datetime value
    const [hours, minutes] = newTime.split(':').map(Number)
    const date = new Date(value)
    date.setHours(hours, minutes, 0, 0)

    onChange(date.toISOString())
  }

  return (
    <input
      type="time"
      className={`time-input-mobile ${className || ''}`}
      value={timeValue}
      onChange={handleTimeChange}
      onBlur={onBlur}
      placeholder={placeholder}
    />
  )
}

/**
 * Adaptive Time Input
 * Automatically chooses mobile or desktop variant based on device
 */
export function TimeInput(props: TimeInputProps) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  return isMobile ? (
    <TimeInputMobile {...props} />
  ) : (
    <TimeInputDesktop {...props} />
  )
}

// Export all variants
export default TimeInput
