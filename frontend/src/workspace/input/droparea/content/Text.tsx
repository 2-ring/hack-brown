import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FirstAid as FirstAidIcon,
  ArrowFatUp as ArrowFatUpIcon,
  ClipboardText as ClipboardIcon
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { IconButton } from '../IconButton'

interface TextProps {
  onClose: () => void
  onSubmit: (text: string) => void
}

export function Text({ onClose, onSubmit }: TextProps) {
  const [text, setText] = useState('')

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text)
      setText('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText()
      if (clipboardText) {
        setText(clipboardText)
      }
    } catch (err) {
      toast.error('Paste Failed', {
        description: 'Could not access clipboard. Please paste manually.',
        duration: 3000,
      })
    }
  }

  return (
    <div className="sound-input-container">
      {/* Paste Button - Outside dock */}
      <IconButton
        icon={ClipboardIcon}
        iconWeight="duotone"
        onClick={handlePaste}
        title="Paste from Clipboard"
        className="external-button"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      />

      {/* Close Button - Outside dock */}
      <motion.button
        className="dock-button close external-button"
        onClick={onClose}
        title="Cancel"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <FirstAidIcon size={24} weight="duotone" style={{ transform: 'rotate(45deg)' }} />
      </motion.button>

      <motion.div
        className="sound-input-dock"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        {/* Text Input */}
        <input
          type="text"
          className="text-input-field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste or type event details here..."
          autoFocus
        />
      </motion.div>

      {/* Submit Button - Outside dock */}
      <motion.button
        className="dock-button submit external-button"
        onClick={handleSubmit}
        title="Submit Text"
        disabled={!text.trim()}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <ArrowFatUpIcon size={28} weight="bold" />
      </motion.button>
    </div>
  )
}
