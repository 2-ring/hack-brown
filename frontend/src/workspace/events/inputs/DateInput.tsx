import { useState, useRef, useEffect, useMemo } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useViewport } from '../../input/shared/hooks/useViewport'
import { BottomDrawer } from './BottomDrawer'
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

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function formatDisplay(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: (number | null)[] = []

  for (let i = 0; i < firstDay; i++) {
    days.push(null)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d)
  }
  return days
}

/* ─── Shared calendar grid ─── */

interface CalendarGridProps {
  value: string
  viewYear: number
  viewMonth: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onDayClick: (day: number) => void
  mobile?: boolean
}

function CalendarGrid({ value, viewYear, viewMonth, onPrevMonth, onNextMonth, onDayClick, mobile }: CalendarGridProps) {
  const selectedDate = useMemo(() => new Date(value), [value])
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const calendarDays = useMemo(() => getCalendarDays(viewYear, viewMonth), [viewYear, viewMonth])
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <div className="date-calendar-header">
        <span className="date-calendar-month-label">{monthLabel}</span>
        <div className="date-calendar-nav">
          <button type="button" className="date-calendar-nav-btn" onClick={onPrevMonth}>
            <CaretLeft size={16} weight="bold" />
          </button>
          <button type="button" className="date-calendar-nav-btn" onClick={onNextMonth}>
            <CaretRight size={16} weight="bold" />
          </button>
        </div>
      </div>

      <div className={`date-calendar-grid ${mobile ? 'date-calendar-grid-mobile' : ''}`}>
        {WEEKDAY_HEADERS.map((label, i) => (
          <div key={`h-${i}`} className="date-calendar-weekday">{label}</div>
        ))}

        {calendarDays.map((day, i) => {
          if (day === null) {
            return <div key={`e-${i}`} className="date-calendar-cell empty" />
          }

          const cellDate = new Date(viewYear, viewMonth, day)
          const isToday = isSameDay(cellDate, today)
          const isSelected = isSameDay(cellDate, selectedDate)

          return (
            <button
              key={`d-${day}`}
              type="button"
              className={[
                'date-calendar-cell',
                isToday && !isSelected ? 'today' : '',
                isSelected ? 'selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onDayClick(day)}
            >
              {day}
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ─── Desktop: inline dropdown ─── */

export function DateInputDesktop({ value, onChange, onFocus, onBlur, isEditing, className }: DateInputProps) {
  const selectedDate = useMemo(() => new Date(value), [value])
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth())
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayValue = useMemo(() => formatDisplay(value), [value])

  useEffect(() => {
    if (isEditing) {
      setViewYear(selectedDate.getFullYear())
      setViewMonth(selectedDate.getMonth())
      setIsOpen(true)
    }
  }, [isEditing, selectedDate])

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

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const handleDayClick = (day: number) => {
    const base = new Date(value)
    const newDate = new Date(
      viewYear, viewMonth, day,
      base.getHours(), base.getMinutes(), base.getSeconds()
    )
    onChange(newDate.toISOString())
    setIsOpen(false)
    onBlur?.()
  }

  if (!isEditing) {
    return <span className={className}>{displayValue}</span>
  }

  return (
    <div className="date-input-container" ref={containerRef}>
      <span
        className={`date-input-display ${className || ''}`}
        onClick={() => {
          onFocus?.()
          setIsOpen(prev => !prev)
        }}
      >
        {displayValue}
      </span>

      {isOpen && (
        <div className="date-calendar-dropdown">
          <CalendarGrid
            value={value}
            viewYear={viewYear}
            viewMonth={viewMonth}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            onDayClick={handleDayClick}
          />
        </div>
      )}
    </div>
  )
}

/* ─── Mobile: bottom drawer ─── */

export function DateInputMobile({ value, onChange, onFocus: _onFocus, onBlur, isEditing, className }: DateInputProps) {
  const selectedDate = useMemo(() => new Date(value), [value])
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth())

  const displayValue = useMemo(() => formatDisplay(value), [value])

  useEffect(() => {
    if (isEditing) {
      setViewYear(selectedDate.getFullYear())
      setViewMonth(selectedDate.getMonth())
    }
  }, [isEditing, selectedDate])

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const handleDayClick = (day: number) => {
    const base = new Date(value)
    const newDate = new Date(
      viewYear, viewMonth, day,
      base.getHours(), base.getMinutes(), base.getSeconds()
    )
    onChange(newDate.toISOString())
    onBlur?.()
  }

  const handleClose = () => {
    onBlur?.()
  }

  return (
    <>
      <span className={className}>{displayValue}</span>
      <BottomDrawer isOpen={!!isEditing} onClose={handleClose}>
        <CalendarGrid
          value={value}
          viewYear={viewYear}
          viewMonth={viewMonth}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onDayClick={handleDayClick}
          mobile
        />
      </BottomDrawer>
    </>
  )
}

/* ─── Router ─── */

export function DateInput(props: DateInputProps) {
  const { isMobile } = useViewport()
  return isMobile ? <DateInputMobile {...props} /> : <DateInputDesktop {...props} />
}
