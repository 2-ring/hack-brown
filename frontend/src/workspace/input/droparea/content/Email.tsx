import { motion } from 'framer-motion'
import {
  FirstAid as FirstAidIcon,
  Envelope as EnvelopeIcon
} from '@phosphor-icons/react'
import { useAuth } from '../../../../auth/AuthContext'

interface EmailProps {
  onClose: () => void
}

export function Email({ onClose }: EmailProps) {
  const { user } = useAuth()

  // Extract username from email (part before @)
  // Fallback to a random guest identifier if no user
  const username = user?.email?.split('@')[0] || `guest${Math.random().toString(36).substring(2, 8)}`
  const dropCalEmail = `${username}@events.dropcal.ai`

  const handlePillClick = () => {
    // Open email client with mailto link
    window.location.href = `mailto:${dropCalEmail}`
  }

  return (
    <div className="sound-input-container">
      {/* Close Button - Outside dock */}
      <motion.button
        className="dock-button close external-button"
        onClick={onClose}
        title="Close"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <FirstAidIcon size={24} weight="duotone" style={{ transform: 'rotate(45deg)' }} />
      </motion.button>

      <motion.div
        className="email-input-dock"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        {/* Email Display */}
        <div
          className="email-display"
          onClick={handlePillClick}
          title="Click to send email"
        >
          <EnvelopeIcon size={20} weight="duotone" className="email-icon" />
          <span className="email-text">{dropCalEmail}</span>
        </div>
      </motion.div>
    </div>
  )
}
