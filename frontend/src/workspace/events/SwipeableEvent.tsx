import { useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { CalendarStar, TrashSimple } from '@phosphor-icons/react'
import type { CalendarEvent } from './types'

const TRIGGER_THRESHOLD = 80
const VELOCITY_THRESHOLD = 500

interface SwipeableEventProps {
  children: React.ReactNode
  event: CalendarEvent
  onSwipeRight?: (event: CalendarEvent) => void
  onSwipeLeft?: (event: CalendarEvent) => void
}

export function SwipeableEvent({ children, event, onSwipeRight, onSwipeLeft }: SwipeableEventProps) {
  const x = useMotionValue(0)
  const [swiping, setSwiping] = useState(false)

  // Icon wrapper width = exposed gap so icon centers in it
  const addGap = useTransform(x, (v) => Math.max(0, v))
  const removeGap = useTransform(x, (v) => Math.max(0, -v))

  // Fade in as card moves
  const addOpacity = useTransform(x, [0, TRIGGER_THRESHOLD], [0, 1])
  const removeOpacity = useTransform(x, [-TRIGGER_THRESHOLD, 0], [1, 0])

  // Subtle scale pop near threshold
  const addScale = useTransform(x, [0, TRIGGER_THRESHOLD * 0.6, TRIGGER_THRESHOLD], [0.5, 0.85, 1.15])
  const removeScale = useTransform(x, [-TRIGGER_THRESHOLD, -TRIGGER_THRESHOLD * 0.6, 0], [1.15, 0.85, 0.5])

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const currentX = x.get()
    const velocity = info.velocity.x

    const triggeredRight = currentX > TRIGGER_THRESHOLD || (currentX > 40 && velocity > VELOCITY_THRESHOLD)
    const triggeredLeft = currentX < -TRIGGER_THRESHOLD || (currentX < -40 && velocity < -VELOCITY_THRESHOLD)

    if (triggeredRight && onSwipeRight) {
      animate(x, 400, { type: 'spring', stiffness: 300, damping: 25 }).then(() => {
        onSwipeRight(event)
        x.set(0)
      })
    } else if (triggeredLeft && onSwipeLeft) {
      animate(x, -400, { type: 'spring', stiffness: 300, damping: 25 }).then(() => {
        onSwipeLeft(event)
        x.set(0)
      })
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 })
    }

    setSwiping(false)
  }

  return (
    <div className="swipeable-event-container">
      {/* Add: full-bleed green bg + icon centered in exposed gap */}
      <motion.div className="swipe-bg swipe-bg-add" style={{ opacity: addOpacity }}>
        <motion.div className="swipe-icon-wrapper" style={{ width: addGap }}>
          <motion.div className="swipe-bg-content" style={{ scale: addScale }}>
            <CalendarStar size={20} weight="duotone" />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Remove: full-bleed red bg + icon centered in exposed gap */}
      <motion.div className="swipe-bg swipe-bg-remove" style={{ opacity: removeOpacity }}>
        <motion.div className="swipe-icon-wrapper" style={{ width: removeGap }}>
          <motion.div className="swipe-bg-content" style={{ scale: removeScale }}>
            <TrashSimple size={20} weight="fill" />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Draggable card */}
      <motion.div
        className="swipeable-card"
        style={{ x }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.25}
        onDragStart={() => setSwiping(true)}
        onDragEnd={handleDragEnd}
        whileDrag={{ cursor: 'grabbing' }}
      >
        <div
          style={{ pointerEvents: swiping ? 'none' : 'auto' }}
          onClickCapture={(e) => {
            if (Math.abs(x.get()) > 5) {
              e.stopPropagation()
              e.preventDefault()
            }
          }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  )
}
