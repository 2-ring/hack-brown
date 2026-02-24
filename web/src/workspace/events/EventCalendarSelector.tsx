import { useState, useRef, useEffect } from 'react'
import { CaretDown as CaretDownIcon } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'

interface CalendarOption {
  id: string
  summary: string
  backgroundColor: string
  primary?: boolean
}

interface EventCalendarSelectorProps {
  selectedCalendarId?: string | null
  calendars: CalendarOption[]
  isLoading?: boolean
  onCalendarSelect?: (calendarId: string | null) => void
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

  // null/undefined = primary calendar
  const currentCalendar = selectedCalendarId
    ? calendars.find(cal => cal.id === selectedCalendarId)
    : calendars.find(cal => cal.primary)
    || calendars[0]

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

  const handleCalendarClick = (calendar: CalendarOption) => {
    // null = primary calendar, only store ID for non-primary
    onCalendarSelect?.(calendar.primary ? null : calendar.id)
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
          {[...calendars].sort((a, b) => {
            if (a.primary && !b.primary) return -1
            if (!a.primary && b.primary) return 1
            return a.summary.localeCompare(b.summary)
          }).map((calendar) => (
            <div
              key={calendar.id}
              className={`calendar-selector-option ${currentCalendar && calendar.id === currentCalendar.id ? 'active' : ''}`}
              onClick={() => handleCalendarClick(calendar)}
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
