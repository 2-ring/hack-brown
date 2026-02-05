import { Icon } from '@phosphor-icons/react'

export interface Notification {
  id: string
  icon: Icon
  iconWeight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  message: string
  persistent?: boolean // If true, will reappear after dismissing other notifications
  priority?: number // Higher priority shows first (default: 0)
}
