import { useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { CalendarStar, ArrowsClockwise, TrashSimple } from '@phosphor-icons/react'
import type { CalendarEvent } from './types'
import { getEventSyncStatus } from './types'

const TRIGGER_THRESHOLD = 80
const VELOCITY_THRESHOLD = 500

interface SwipeableEventProps {
  children: React.ReactNode
  event: CalendarEvent
  activeProvider?: string
  onSwipeRight?: (event: CalendarEvent) => void
  onSwipeLeft?: (event: CalendarEvent) => void
}

export function SwipeableEvent({ children, event, activeProvider, onSwipeRight, onSwipeLeft }: SwipeableEventProps) {
  const x = useMotionValue(0)
  const [swiping, setSwiping] = useState(false)

  // Determine if this is a create (draft) or sync (already created)
  const syncStatus = getEventSyncStatus(event, activeProvider)
  const isSync = syncStatus !== 'draft'

  // Icon wrapper width = exposed gap so icon centers in it
  const addGap = useTransform(x, (v) => Math.max(0, v))
  const removeGap = useTransform(x, (v) => Math.max(0, -v))

  // Fade in as card moves
  const addOpacity = useTransform(x, [0, TRIGGER_THRESHOLD], [0, 1])
  const removeOpacity = useTransform(x, [-TRIGGER_THRESHOLD, 0], [1, 0])

  // Icon opacity (fades in faster than background)
  const addIconOpacity = useTransform(x, [0, TRIGGER_THRESHOLD * 0.5], [0, 1])
  const removeIconOpacity = useTransform(x, [-TRIGGER_THRESHOLD * 0.5, 0], [1, 0])

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const currentX = x.get()
    const velocity = info.velocity.x

    const triggeredRight = currentX > TRIGGER_THRESHOLD || (currentX > 40 && velocity > VELOCITY_THRESHOLD)
    const triggeredLeft = currentX < -TRIGGER_THRESHOLD || (currentX < -40 && velocity < -VELOCITY_THRESHOLD)

    // Spring back to original position
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 50 })

    if (triggeredRight && onSwipeRight) {
      onSwipeRight(event)
    } else if (triggeredLeft && onSwipeLeft) {
      onSwipeLeft(event)
    }

    setSwiping(false)
  }

  const AddIcon = isSync ? ArrowsClockwise : CalendarStar
  const addBgClass = isSync ? 'swipe-bg-sync' : 'swipe-bg-add'

  return (
    <div className="swipeable-event-container">
      {/* Right swipe: create (green) or sync (yellow) */}
      <motion.div className={`swipe-bg ${addBgClass}`} style={{ opacity: addOpacity }}>
        <motion.div className="swipe-icon-wrapper" style={{ width: addGap }}>
          <motion.div className="swipe-bg-content" style={{ opacity: addIconOpacity }}>
            <AddIcon size={28} weight={isSync ? 'bold' : 'duotone'} />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Left swipe: remove (red) */}
      <motion.div className="swipe-bg swipe-bg-remove" style={{ opacity: removeOpacity }}>
        <motion.div className="swipe-icon-wrapper" style={{ width: removeGap }}>
          <motion.div className="swipe-bg-content" style={{ opacity: removeIconOpacity }}>
            <TrashSimple size={28} weight="fill" />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Draggable card */}
      <motion.div
        className="swipeable-card"
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -TRIGGER_THRESHOLD, right: TRIGGER_THRESHOLD }}
        dragElastic={0.15}
        dragMomentum={false}
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
