import { useState, useRef, useCallback } from 'react'
import './ClockPicker.css'

interface ClockPickerProps {
  value: string
  onChange: (value: string) => void
  onCancel: () => void
}

type Mode = 'hour' | 'minute'

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTE_LABELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

function getAngleFromPoint(cx: number, cy: number, px: number, py: number): number {
  const dx = px - cx
  const dy = py - cy
  let angle = Math.atan2(dy, dx) * (180 / Math.PI)
  angle = (angle + 90 + 360) % 360
  return angle
}

function angleToHour(angle: number): number {
  const h = Math.round(angle / 30) % 12
  return h === 0 ? 12 : h
}

function angleToMinute(angle: number): number {
  const raw = Math.round(angle / 6) % 60
  return Math.round(raw / 5) * 5 % 60
}

function hourToAngle(hour: number): number {
  return (hour % 12) * 30
}

function minuteToAngle(minute: number): number {
  return minute * 6
}

export function ClockPicker({ value, onChange, onCancel }: ClockPickerProps) {
  const date = new Date(value)
  const h24 = date.getHours()

  const [mode, setMode] = useState<Mode>('hour')
  const [hour, setHour] = useState(h24 % 12 || 12)
  const [minute, setMinute] = useState(date.getMinutes())
  const [isPM, setIsPM] = useState(h24 >= 12)
  const [isDragging, setIsDragging] = useState(false)

  const clockRef = useRef<HTMLDivElement>(null)

  const getClockCenter = useCallback(() => {
    if (!clockRef.current) return { cx: 0, cy: 0 }
    const rect = clockRef.current.getBoundingClientRect()
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 }
  }, [])

  const updateFromPointer = useCallback((clientX: number, clientY: number, commit: boolean) => {
    const { cx, cy } = getClockCenter()
    const angle = getAngleFromPoint(cx, cy, clientX, clientY)

    if (mode === 'hour') {
      setHour(angleToHour(angle))
      if (commit) {
        setTimeout(() => setMode('minute'), 200)
      }
    } else {
      setMinute(angleToMinute(angle))
    }
  }, [mode, getClockCenter])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setIsDragging(true)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    updateFromPointer(e.clientX, e.clientY, false)
  }, [updateFromPointer])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    updateFromPointer(e.clientX, e.clientY, false)
  }, [isDragging, updateFromPointer])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    setIsDragging(false)
    updateFromPointer(e.clientX, e.clientY, true)
  }, [isDragging, updateFromPointer])

  const handleOk = () => {
    const newDate = new Date(value)
    let h = hour % 12
    if (isPM) h += 12
    newDate.setHours(h, minute, 0, 0)
    onChange(newDate.toISOString())
  }

  // Snap displayed minute to nearest 5 for consistent display
  const displayMinute = Math.round(minute / 5) * 5 % 60
  const handAngle = mode === 'hour' ? hourToAngle(hour) : minuteToAngle(displayMinute)
  const numbers = mode === 'hour' ? HOURS : MINUTE_LABELS
  const selectedValue = mode === 'hour' ? hour : displayMinute

  return (
    <div className="clock-picker">
      <div className="clock-picker-header">
        <div className="clock-picker-time-display">
          <button
            type="button"
            className={`clock-picker-segment ${mode === 'hour' ? 'active' : ''}`}
            onClick={() => setMode('hour')}
          >
            {String(hour).padStart(2, '0')}
          </button>
          <span className="clock-picker-colon">:</span>
          <button
            type="button"
            className={`clock-picker-segment ${mode === 'minute' ? 'active' : ''}`}
            onClick={() => setMode('minute')}
          >
            {String(displayMinute).padStart(2, '0')}
          </button>
        </div>
        <div className="clock-picker-period">
          <button
            type="button"
            className={`clock-picker-period-btn ${!isPM ? 'active' : ''}`}
            onClick={() => setIsPM(false)}
          >
            AM
          </button>
          <button
            type="button"
            className={`clock-picker-period-btn ${isPM ? 'active' : ''}`}
            onClick={() => setIsPM(true)}
          >
            PM
          </button>
        </div>
      </div>

      <div
        className="clock-picker-face"
        ref={clockRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchStart={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        <div className="clock-picker-hand" style={{ transform: `rotate(${handAngle}deg)` }}>
          <div className="clock-picker-hand-line" />
          <div className="clock-picker-hand-tip" />
        </div>
        <div className="clock-picker-center-dot" />

        {numbers.map((num, i) => {
          const angle = (i * 360 / 12 - 90) * (Math.PI / 180)
          const isActive = num === selectedValue
          return (
            <div
              key={num}
              className={`clock-picker-number ${isActive ? 'active' : ''}`}
              style={{
                left: `${50 + 40 * Math.cos(angle)}%`,
                top: `${50 + 40 * Math.sin(angle)}%`,
              }}
            >
              {mode === 'minute' ? String(num).padStart(2, '0') : num}
            </div>
          )
        })}
      </div>

      <div className="clock-picker-footer">
        <button type="button" className="clock-picker-action" onClick={onCancel}>Cancel</button>
        <button type="button" className="clock-picker-action clock-picker-action-ok" onClick={handleOk}>OK</button>
      </div>
    </div>
  )
}
