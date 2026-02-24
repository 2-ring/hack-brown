import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useNotificationQueue } from './useNotificationQueue'
import type { Notification } from './types'

interface NotificationContextValue {
  currentNotification: Notification | null
  addNotification: (notification: Notification) => void
  removeNotification: (id: string) => void
  dismissNotification: (id: string) => void
  clearAll: () => void
  hasNotifications: boolean
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const notificationQueue = useNotificationQueue()

  return (
    <NotificationContext.Provider value={notificationQueue}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}
