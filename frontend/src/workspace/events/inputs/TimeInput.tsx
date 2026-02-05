import { useState, useRef, useEffect } from 'react'
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

export function TimeInputDesktop({ value, onChange, onFocus, onBlur, isEditing, placeholder, className, startTime }: TimeInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) {
      const date = new Date(value)
      setInputValue(date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }))
    }
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      // Position cursor before AM/PM
      const amPmMatch = inputValue.match(/\s?(AM|PM)$/i)
      if (amPmMatch) {
        const position = inputValue.length - amPmMatch[0].length
        inputRef.current.setSelectionRange(position, position)
      }
    }
  }, [isEditing, inputValue])

  const generateTimeSuggestions = () => {
    const times: { value: string; label: string }[] = []
    const baseDate = new Date(value)
    const today = new Date(baseDate.toDateString())

    if (startTime) {
      // End time: 15-min increments for first hour, then 30-min increments
      const startDate = new Date(startTime)

      // First hour: 0, 15, 30, 45 mins, and 1 hr (5 slots)
      for (let mins = 0; mins <= 60; mins += 15) {
        const time = new Date(startDate)
        time.setMinutes(startDate.getMinutes() + mins)

        const timeLabel = time.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })

        let durationText = ''
        if (mins === 0) {
          durationText = ' (0 mins)'
        } else if (mins === 15) {
          durationText = ' (15 mins)'
        } else if (mins === 30) {
          durationText = ' (30 mins)'
        } else if (mins === 45) {
          durationText = ' (45 mins)'
        } else if (mins === 60) {
          durationText = ' (1 hr)'
        }

        times.push({
          value: time.toISOString(),
          label: timeLabel + durationText
        })
      }

      // After first hour: 30-min increments up to 23.5 hrs
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
        const durationText = ` (${decimalHours} hrs)`

        times.push({
          value: time.toISOString(),
          label: timeLabel + durationText
        })
      }
    } else {
      // Start time: Show all times from 12am to 11:45pm in 15-min increments
      for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const time = new Date(today)
          time.setHours(hour, minute, 0, 0)

          const timeLabel = time.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })

          times.push({
            value: time.toISOString(),
            label: timeLabel
          })
        }
      }
    }

    return times
  }

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

  const handleInputBlur = () => {
    setTimeout(() => {
      setIsOpen(false)
      onBlur?.()
    }, 200)
  }

  const handleInputFocus = () => {
    onFocus?.()
    setIsOpen(true)
    setIsTyping(false)
  }

  // Position dropdown at current time when it opens (for start time only)
  useEffect(() => {
    if (isOpen && !startTime && dropdownRef.current) {
      const currentDate = new Date(value)
      const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes()

      // Find closest 15-min interval
      const intervalIndex = Math.round(currentMinutes / 15)
      const optionHeight = 42 // Approximate height of each option
      const scrollPosition = intervalIndex * optionHeight - dropdownRef.current.clientHeight / 2

      dropdownRef.current.scrollTop = scrollPosition
    }
  }, [isOpen, startTime, value])

  const timeSuggestions = generateTimeSuggestions()
  const filteredSuggestions = isTyping && inputValue
    ? timeSuggestions
        .filter(t => t.label.toLowerCase().includes(inputValue.toLowerCase()))
        .slice(0, 10)
    : timeSuggestions

  return (
    <div className="time-input-container">
      <input
        ref={inputRef}
        type="text"
        className={`time-input ${className || ''}`}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
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

export function TimeInputMobile({ value, onChange, onFocus, onBlur, isEditing, placeholder, className }: TimeInputProps) {
  const [timeValue, setTimeValue] = useState('')

  useEffect(() => {
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
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      readOnly={!isEditing}
    />
  )
}

export function TimeInput(props: TimeInputProps) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  return isMobile ? <TimeInputMobile {...props} /> : <TimeInputDesktop {...props} />
}
