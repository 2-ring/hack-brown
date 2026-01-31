import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  X as XIcon,
  ArrowFatUp as ArrowFatUpIcon
} from '@phosphor-icons/react'

interface TextInputProps {
  onClose: () => void
  onSubmit: (text: string) => void
}

export function TextInput({ onClose, onSubmit }: TextInputProps) {
  const [text, setText] = useState('')

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text)
      setText('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  return (
    <div className="sound-input-container">
      <motion.div
        className="sound-input-dock text-input-dock"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        {/* Close Button */}
        <button
          className="dock-button close"
          onClick={onClose}
          title="Cancel"
        >
          <XIcon size={24} weight="bold" />
        </button>

        {/* Text Input */}
        <textarea
          className="text-input-area"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste or type event details here..."
          autoFocus
        />

        {/* Submit Button */}
        <button
          className="dock-button submit"
          onClick={handleSubmit}
          title="Submit Text"
          disabled={!text.trim()}
        >
          <ArrowFatUpIcon size={28} weight="bold" />
        </button>
      </motion.div>
    </div>
  )
}
