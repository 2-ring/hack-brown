import { useState, useRef, useEffect, useMemo } from 'react'
import { GlobeSimple, ArrowLeft, X as XIcon } from '@phosphor-icons/react'
import { getTimezoneList, formatTimezoneDisplay, filterTimezones } from '../timezone'
import { useViewport } from '../../input/shared/hooks/useViewport'
import { BottomDrawer } from './BottomDrawer'
import './TimezoneInput.css'

export interface TimezoneInputProps {
  value: string
  onChange: (timezone: string) => void
  onFocus?: () => void
  onBlur?: () => void
  isEditing?: boolean
  className?: string
}

/* ─── Desktop: inline dropdown ─── */

export function TimezoneInputDesktop({ value, onChange, onFocus, onBlur, isEditing, className }: TimezoneInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
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
    onBlur?.()
  }

  // Click-outside to close
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
        onBlur?.()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen, onBlur])

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
    <div className="timezone-input-container" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        className={`timezone-input ${className || ''}`}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={handleInputFocus}
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

/* ─── Mobile: bottom drawer ─── */

export function TimezoneInputMobile({ value, onChange, onBlur, isEditing, className }: TimezoneInputProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allTimezones = useMemo(() => getTimezoneList(), [])
  const displayValue = useMemo(() => formatTimezoneDisplay(value), [value])
  const filteredTimezones = useMemo(
    () => filterTimezones(allTimezones, searchQuery),
    [allTimezones, searchQuery]
  )

  useEffect(() => {
    if (isEditing) {
      setSearchQuery('')
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isEditing])

  useEffect(() => {
    if (isEditing && !searchQuery && listRef.current) {
      const currentIndex = allTimezones.findIndex(tz => tz.iana === value)
      if (currentIndex >= 0) {
        const optionHeight = 80
        listRef.current.scrollTop = currentIndex * optionHeight - listRef.current.clientHeight / 2
      }
    }
  }, [isEditing, searchQuery, value, allTimezones])

  const handleSelect = (iana: string) => {
    onChange(iana)
    setSearchQuery('')
    onBlur?.()
  }

  const handleClose = () => {
    setSearchQuery('')
    onBlur?.()
  }

  return (
    <>
      <span className={className}>{displayValue}</span>
      <BottomDrawer isOpen={!!isEditing} onClose={handleClose}>
        <div className="tz-search-bar">
          <button type="button" className="tz-search-back" onClick={handleClose}>
            <ArrowLeft size={20} weight="regular" />
          </button>
          <input
            ref={inputRef}
            type="text"
            className="tz-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search timezones..."
          />
          {searchQuery && (
            <button type="button" className="tz-search-clear" onClick={() => setSearchQuery('')}>
              <XIcon size={18} weight="regular" />
            </button>
          )}
        </div>
        <div className="tz-drawer-list" ref={listRef}>
          {filteredTimezones.map((tz) => (
            <button
              key={tz.iana}
              className="tz-drawer-item"
              onClick={() => handleSelect(tz.iana)}
              type="button"
            >
              <GlobeSimple size={22} weight="regular" className="tz-item-icon" />
              <div className="tz-item-info">
                <span className="tz-item-name">{tz.longName}</span>
                <span className="tz-item-time">{tz.currentTime}  {tz.shortOffset}</span>
                <span className="tz-item-region">{tz.region}, {tz.city}</span>
              </div>
            </button>
          ))}
        </div>
      </BottomDrawer>
    </>
  )
}

/* ─── Router ─── */

export function TimezoneInput(props: TimezoneInputProps) {
  const { isMobile } = useViewport()
  return isMobile ? <TimezoneInputMobile {...props} /> : <TimezoneInputDesktop {...props} />
}
