import {
  SwipeableList,
  SwipeableListItem,
  SwipeAction,
  LeadingActions,
  TrailingActions,
  Type,
} from 'react-swipeable-list'
import 'react-swipeable-list/dist/styles.css'
import { CalendarStar, X } from '@phosphor-icons/react'
import type { CalendarEvent } from './types'

interface SwipeableEventProps {
  children: React.ReactNode
  event: CalendarEvent
  onSwipeRight?: (event: CalendarEvent) => void
  onSwipeLeft?: (event: CalendarEvent) => void
}

export function SwipeableEvent({ children, event, onSwipeRight, onSwipeLeft }: SwipeableEventProps) {
  const leadingActions = onSwipeRight ? (
    <LeadingActions>
      <SwipeAction onClick={() => onSwipeRight(event)}>
        <div className="swipe-action-panel swipe-action-add">
          <CalendarStar size={22} weight="duotone" />
          <span>Add</span>
        </div>
      </SwipeAction>
    </LeadingActions>
  ) : undefined

  const trailingActions = onSwipeLeft ? (
    <TrailingActions>
      <SwipeAction destructive onClick={() => onSwipeLeft(event)}>
        <div className="swipe-action-panel swipe-action-remove">
          <X size={22} weight="bold" />
          <span>Remove</span>
        </div>
      </SwipeAction>
    </TrailingActions>
  ) : undefined

  return (
    <SwipeableList
      type={Type.IOS}
      fullSwipe
      threshold={0.35}
      destructiveCallbackDelay={200}
    >
      <SwipeableListItem
        leadingActions={leadingActions}
        trailingActions={trailingActions}
      >
        {children}
      </SwipeableListItem>
    </SwipeableList>
  )
}
