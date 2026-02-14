import { motion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import type { Notification } from './types'
import './NotificationBar.css'

interface NotificationBarProps {
  notification: Notification
  onDismiss: (id: string) => void
}

export function NotificationBar({ notification, onDismiss }: NotificationBarProps) {
  const Icon = notification.icon
  const variant = notification.variant || 'info'

  return (
    <motion.div
      className={`notification-bar notification-bar--${variant}`}
      initial={{ y: 20, scale: 0.95, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ y: -20, scale: 0.95, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <Icon
        size={24}
        weight={notification.iconWeight || 'duotone'}
        className="notification-bar-icon"
      />
      <p className="notification-bar-text" data-nosnippet>{notification.message}</p>
      <button
        className="notification-bar-close"
        onClick={() => onDismiss(notification.id)}
        aria-label="Dismiss notification"
      >
        <X size={18} weight="regular" />
      </button>
    </motion.div>
  )
}
