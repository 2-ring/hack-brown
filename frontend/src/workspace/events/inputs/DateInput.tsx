import { useState, useRef, useEffect } from 'react'
import './DateInput.css'

export interface DateInputProps {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  isEditing?: boolean
  placeholder?: string
  className?: string
}

export function DateInputDesktop({ value, onChange, onFocus, onBlur, isEditing, placeholder, className }: DateInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (value) {
      const date = new Date(value)
      setInputValue(date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      }))
    }
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      const length = inputRef.current.value.length
      inputRef.current.setSelectionRange(length, length)
    }
  }, [isEditing, inputValue])

  const generateDateSuggestions = () => {
    const dates: { value: string; label: string; sublabel?: string }[] = []
    const baseDate = new Date(value)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get time from baseDate to preserve it
    const hours = baseDate.getHours()
    const minutes = baseDate.getMinutes()
    const seconds = baseDate.getSeconds()

    for (let i = 0; i < 14; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      date.setHours(hours, minutes, seconds, 0)

      let label = ''
      let sublabel = ''

      if (i === 0) {
        label = 'Today'
        sublabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      } else if (i === 1) {
        label = 'Tomorrow'
        sublabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      } else {
        label = date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        })
      }

      dates.push({
        value: date.toISOString(),
        label,
        sublabel
      })
    }

    return dates
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    if (newValue.length > 0) {
      setIsOpen(true)
    }
  }

  const handleDateSelect = (dateValue: string) => {
    onChange(dateValue)
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
  }

  const dateSuggestions = generateDateSuggestions()
  const filteredSuggestions = dateSuggestions
    .filter(d => !inputValue ||
      d.label.toLowerCase().includes(inputValue.toLowerCase()) ||
      d.sublabel?.toLowerCase().includes(inputValue.toLowerCase())
    )
    .slice(0, 10)

  return (
    <div className="date-input-container">
      <input
        ref={inputRef}
        type="text"
        className={`date-input ${className || ''}`}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder || 'Enter date'}
        readOnly={!isEditing}
      />

      {isOpen && isEditing && filteredSuggestions.length > 0 && (
        <div className="date-dropdown">
          {filteredSuggestions.map((date, index) => (
            <button
              key={index}
              className="date-option"
              onClick={() => handleDateSelect(date.value)}
              type="button"
            >
              <span className="date-option-label">{date.label}</span>
              {date.sublabel && <span className="date-option-sublabel">{date.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DateInputMobile({ value, onChange, onFocus, onBlur, isEditing, placeholder, className }: DateInputProps) {
  const [dateValue, setDateValue] = useState('')

  useEffect(() => {
    if (value) {
      const date = new Date(value)
      const year = date.getFullYear()
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const day = date.getDate().toString().padStart(2, '0')
      setDateValue(`${year}-${month}-${day}`)
    }
  }, [value])

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value
    setDateValue(newDate)

    const date = new Date(value)
    const [year, month, day] = newDate.split('-').map(Number)
    date.setFullYear(year, month - 1, day)

    onChange(date.toISOString())
  }

  return (
    <input
      type="date"
      className={`date-input-mobile ${className || ''}`}
      value={dateValue}
      onChange={handleDateChange}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      readOnly={!isEditing}
    />
  )
}

export function DateInput(props: DateInputProps) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  return isMobile ? <DateInputMobile {...props} /> : <DateInputDesktop {...props} />
}
