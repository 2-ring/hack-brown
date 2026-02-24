import { useState, useRef, useEffect } from 'react'
import { useViewport } from '../../input/shared/hooks/useViewport'
import { BottomDrawer } from './BottomDrawer'
import { ClockPicker } from './ClockPicker'
import './TimeInput.css'

export interface TimeInputProps {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  isEditing?: boolean
  placeholder?: string
  className?: string
  startTime?: string // If provided, shows duration from this time
}

/* ─── Shared time suggestion generation ─── */

function generateTimeSuggestions(value: string, startTime?: string): { value: string; label: string }[] {
  const times: { value: string; label: string }[] = []
  const baseDate = new Date(value)
  const today = new Date(baseDate.toDateString())

  if (startTime) {
    const startDate = new Date(startTime)

    for (let mins = 0; mins <= 60; mins += 15) {
      const time = new Date(startDate)
      time.setMinutes(startDate.getMinutes() + mins)

      const timeLabel = time.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })

      let durationText = ''
      if (mins === 0) durationText = ' (0 mins)'
      else if (mins === 15) durationText = ' (15 mins)'
      else if (mins === 30) durationText = ' (30 mins)'
      else if (mins === 45) durationText = ' (45 mins)'
      else if (mins === 60) durationText = ' (1 hr)'

      times.push({ value: time.toISOString(), label: timeLabel + durationText })
    }

    for (let halfHours = 3; halfHours <= 47; halfHours++) {
      const mins = halfHours * 30
      const time = new Date(startDate)
      time.setMinutes(startDate.getMinutes() + mins)

      const timeLabel = time.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })

      const decimalHours = halfHours / 2
      times.push({ value: time.toISOString(), label: timeLabel + ` (${decimalHours} hrs)` })
    }
  } else {
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const time = new Date(today)
        time.setHours(hour, minute, 0, 0)

        const timeLabel = time.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })

        times.push({ value: time.toISOString(), label: timeLabel })
      }
    }
  }

  return times
}

function formatTimeDisplay(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

/* ─── Desktop: inline dropdown ─── */

export function TimeInputDesktop({ value, onChange, onFocus, onBlur, isEditing, placeholder, className, startTime }: TimeInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) {
      setInputValue(formatTimeDisplay(value))
    }
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      const amPmMatch = inputValue.match(/\s?(AM|PM)$/i)
      if (amPmMatch) {
        const position = inputValue.length - amPmMatch[0].length
        inputRef.current.setSelectionRange(position, position)
      }
    }
  }, [isEditing, inputValue])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsTyping(true)
    if (newValue.length > 0) {
      setIsOpen(true)
    }
  }

  const handleTimeSelect = (timeValue: string) => {
    onChange(timeValue)
    setIsOpen(false)
  }

  // Click-outside to close
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        onBlur?.()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen, onBlur])

  const handleInputFocus = () => {
    onFocus?.()
    setIsOpen(true)
    setIsTyping(false)
  }

  useEffect(() => {
    if (isOpen && !startTime && dropdownRef.current) {
      const currentDate = new Date(value)
      const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes()
      const intervalIndex = Math.round(currentMinutes / 15)
      const optionHeight = 42
      const scrollPosition = intervalIndex * optionHeight - dropdownRef.current.clientHeight / 2

      dropdownRef.current.scrollTop = scrollPosition
    }
  }, [isOpen, startTime, value])

  const timeSuggestions = generateTimeSuggestions(value, startTime)
  const filteredSuggestions = isTyping && inputValue
    ? timeSuggestions
        .filter(t => t.label.toLowerCase().includes(inputValue.toLowerCase()))
        .slice(0, 10)
    : timeSuggestions

  return (
    <div className="time-input-container" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        className={`time-input ${className || ''}`}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        placeholder={placeholder || 'Enter time'}
        readOnly={!isEditing}
      />

      {isOpen && isEditing && filteredSuggestions.length > 0 && (
        <div className="time-dropdown" ref={dropdownRef}>
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

/* ─── Mobile: bottom drawer ─── */

export function TimeInputMobile({ value, onChange, onBlur, isEditing, className }: TimeInputProps) {
  const displayValue = formatTimeDisplay(value)

  const handleChange = (timeValue: string) => {
    onChange(timeValue)
    onBlur?.()
  }

  const handleClose = () => {
    onBlur?.()
  }

  return (
    <>
      <span className={className}>{displayValue}</span>
      <BottomDrawer isOpen={!!isEditing} onClose={handleClose}>
        <ClockPicker
          value={value}
          onChange={handleChange}
          onCancel={handleClose}
        />
      </BottomDrawer>
    </>
  )
}

/* ─── Router ─── */

export function TimeInput(props: TimeInputProps) {
  const { isMobile } = useViewport()
  return isMobile ? <TimeInputMobile {...props} /> : <TimeInputDesktop {...props} />
}
