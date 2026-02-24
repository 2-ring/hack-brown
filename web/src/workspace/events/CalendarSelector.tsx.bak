import { useState, useRef, useEffect } from 'react'
import { CaretDown as CaretDownIcon } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'

interface CalendarOption {
  id: string
  name: string
  icon: React.ReactNode
}

interface CalendarSelectorProps {
  selectedCalendar?: CalendarOption
  calendars?: CalendarOption[]
  isLoading?: boolean
  onCalendarSelect?: (calendarId: string) => void
  isMinimized?: boolean
}

const GoogleIcon = ({ size = 16 }: { size?: number }) => (
  <svg className="calendar-selector-icon" viewBox="0 0 48 48" width={size} height={size}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    <path fill="none" d="M0 0h48v48H0z"/>
  </svg>
)

export function CalendarSelector({
  selectedCalendar,
  calendars = [],
  isLoading = false,
  onCalendarSelect,
  isMinimized = false
}: CalendarSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Default to Google if no calendar is selected
  const currentCalendar = selectedCalendar || {
    id: 'google',
    name: 'Google',
    icon: <GoogleIcon size={16} />
  }

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

  if (isLoading) {
    return <Skeleton width={120} height={24} borderRadius={12} />
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        className={`calendar-selector-button ${isMinimized ? 'minimized' : ''}`}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        {currentCalendar.icon}
        <span className="calendar-selector-provider">{currentCalendar.name}</span>
        <CaretDownIcon
          size={10}
          weight="regular"
          className={`calendar-selector-chevron ${isDropdownOpen ? 'open' : ''}`}
        />
      </button>

      {isDropdownOpen && (
        <div className="calendar-selector-dropdown">
          {calendars.length > 0 ? (
            calendars.map((calendar) => (
              <div
                key={calendar.id}
                className={`calendar-selector-option ${calendar.id === currentCalendar.id ? 'active' : ''}`}
                onClick={() => handleCalendarClick(calendar.id)}
              >
                {calendar.icon}
                <span>{calendar.name}</span>
              </div>
            ))
          ) : (
            <div className="calendar-selector-option active">
              <GoogleIcon size={18} />
              <span>Google</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
