import { useState, useRef, useEffect, useMemo } from 'react'
import { getTimezoneList, formatTimezoneDisplay, filterTimezones } from '../timezone'
import './TimezoneInput.css'

export interface TimezoneInputProps {
  value: string
  onChange: (timezone: string) => void
  onFocus?: () => void
  onBlur?: () => void
  isEditing?: boolean
  className?: string
}

export function TimezoneInput({ value, onChange, onFocus, onBlur, isEditing, className }: TimezoneInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const allTimezones = useMemo(() => getTimezoneList(), [])
  const displayValue = useMemo(() => formatTimezoneDisplay(value), [value])
  const filteredTimezones = useMemo(
    () => filterTimezones(allTimezones, searchQuery),
    [allTimezones, searchQuery]
  )

  useEffect(() => {
    if (isEditing && inputRef.current) {
      setSearchQuery('')
      setIsOpen(true)
      inputRef.current.focus()
    }
  }, [isEditing])

  // Scroll to current timezone when dropdown opens with no search
  useEffect(() => {
    if (isOpen && !searchQuery && dropdownRef.current) {
      const currentIndex = allTimezones.findIndex(tz => tz.iana === value)
      if (currentIndex >= 0) {
        const optionHeight = 42
        dropdownRef.current.scrollTop = currentIndex * optionHeight - dropdownRef.current.clientHeight / 2
      }
    }
  }, [isOpen, searchQuery, value, allTimezones])

  const handleSelect = (iana: string) => {
    onChange(iana)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleInputBlur = () => {
    setTimeout(() => {
      setIsOpen(false)
      setSearchQuery('')
      onBlur?.()
    }, 200)
  }

  const handleInputFocus = () => {
    onFocus?.()
    setIsOpen(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setSearchQuery('')
      onBlur?.()
    }
  }

  if (!isEditing) {
    return <span className={className}>{displayValue}</span>
  }

  return (
    <div className="timezone-input-container">
      <input
        ref={inputRef}
        type="text"
        className={`timezone-input ${className || ''}`}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        placeholder={displayValue}
      />
      {isOpen && filteredTimezones.length > 0 && (
        <div className="timezone-dropdown" ref={dropdownRef}>
          {filteredTimezones.map((tz) => (
            <button
              key={tz.iana}
              className={`timezone-option ${tz.iana === value ? 'active' : ''}`}
              onClick={() => handleSelect(tz.iana)}
              type="button"
            >
              {tz.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
