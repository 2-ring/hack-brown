import { useState, useRef, useEffect } from 'react'
import { CaretDown as CaretDownIcon } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'

interface CalendarOption {
  id: string
  summary: string
  backgroundColor: string
}

interface EventCalendarSelectorProps {
  selectedCalendarId?: string
  calendars: CalendarOption[]
  isLoading?: boolean
  onCalendarSelect?: (calendarId: string) => void
}

const ColoredDot = ({ color, size = 12 }: { color: string; size?: number }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      backgroundColor: color,
      flexShrink: 0
    }}
  />
)

export function EventCalendarSelector({
  selectedCalendarId,
  calendars,
  isLoading = false,
  onCalendarSelect
}: EventCalendarSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Find the selected calendar or default to first one
  const currentCalendar = calendars.find(cal => cal.id === selectedCalendarId) || calendars[0]

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  const handleCalendarClick = (calendarId: string) => {
    onCalendarSelect?.(calendarId)
    setIsDropdownOpen(false)
  }

  if (isLoading || !currentCalendar) {
    return <Skeleton width={100} height={24} borderRadius={12} />
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        className="calendar-selector-button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        style={{ fontSize: '0.8125rem' }}
      >
        <ColoredDot color={currentCalendar.backgroundColor} size={10} />
        <span className="calendar-selector-provider">{currentCalendar.summary}</span>
        <CaretDownIcon
          size={12}
          weight="bold"
          className={`calendar-selector-chevron ${isDropdownOpen ? 'open' : ''}`}
        />
      </button>

      {isDropdownOpen && (
        <div className="calendar-selector-dropdown">
          {calendars.map((calendar) => (
            <div
              key={calendar.id}
              className={`calendar-selector-option ${calendar.id === currentCalendar.id ? 'active' : ''}`}
              onClick={() => handleCalendarClick(calendar.id)}
            >
              <ColoredDot color={calendar.backgroundColor} size={12} />
              <span>{calendar.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
