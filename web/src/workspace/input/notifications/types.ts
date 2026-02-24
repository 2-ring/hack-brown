import type { Icon } from '@phosphor-icons/react'

export type NotificationVariant = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  icon: Icon
  iconWeight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  message: string
  variant?: NotificationVariant
  persistent?: boolean // If true, will reappear after dismissing other notifications
  priority?: number // Higher priority shows first (default: 0)
  ttl?: number // Auto-dismiss after this many milliseconds
}
