import { useState, useCallback, useEffect, useRef } from 'react'
import type { Notification } from './types'

export function useNotificationQueue() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const ttlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Add a notification to the queue
  const addNotification = useCallback((notification: Notification) => {
    setNotifications(prev => {
      // Remove any existing notification with the same ID
      const filtered = prev.filter(n => n.id !== notification.id)
      // Add new notification and sort by priority (higher first)
      return [...filtered, notification].sort((a, b) =>
        (b.priority || 0) - (a.priority || 0)
      )
    })
    // Remove from dismissed set if it was previously dismissed
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.delete(notification.id)
      return next
    })
  }, [])

  // Remove a notification by ID
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  // Dismiss a notification (mark as dismissed, remove non-persistent ones)
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === id)
      if (!notification) return prev

      // Mark as dismissed
      setDismissedIds(dismissedSet => new Set(dismissedSet).add(id))

      // Remove if not persistent
      if (!notification.persistent) {
        return prev.filter(n => n.id !== id)
      }

      return prev
    })
  }, [])

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([])
    setDismissedIds(new Set())
  }, [])

  // Get the current notification to display (first non-dismissed one)
  const currentNotification = notifications.find(n => !dismissedIds.has(n.id)) || null

  // Auto-dismiss notifications with a TTL
  useEffect(() => {
    if (ttlTimerRef.current) {
      clearTimeout(ttlTimerRef.current)
      ttlTimerRef.current = null
    }
    if (currentNotification?.ttl) {
      ttlTimerRef.current = setTimeout(() => {
        dismissNotification(currentNotification.id)
      }, currentNotification.ttl)
    }
    return () => {
      if (ttlTimerRef.current) {
        clearTimeout(ttlTimerRef.current)
      }
    }
  }, [currentNotification?.id, currentNotification?.ttl, dismissNotification])

  return {
    currentNotification,
    addNotification,
    removeNotification,
    dismissNotification,
    clearAll,
    hasNotifications: notifications.length > 0,
  }
}
