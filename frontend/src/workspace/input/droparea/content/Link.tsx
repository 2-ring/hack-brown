import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  X as XIcon,
  ArrowFatUp as ArrowFatUpIcon
} from '@phosphor-icons/react'
import { toast } from 'sonner'

interface LinkProps {
  onClose: () => void
  onSubmit: (url: string) => void
}

// URL validation regex
const URL_REGEX = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(:\d+)?(\/[^\s]*)?$/i

export function Link({ onClose, onSubmit }: LinkProps) {
  const [url, setUrl] = useState('')
  const [isValid, setIsValid] = useState(false)

  const validateUrl = (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) {
      setIsValid(false)
      return
    }
    setIsValid(URL_REGEX.test(trimmed))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUrl(value)
    validateUrl(value)
  }

  const handleSubmit = async () => {
    if (!isValid || !url.trim()) {
      return
    }

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

      // Call backend endpoint to scrape URL
      const response = await fetch(`${API_URL}/api/scrape-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch URL' }))
        throw new Error(errorData.message || errorData.error || 'Failed to fetch URL content')
      }

      const data = await response.json()

      if (!data.content) {
        throw new Error('No content found at URL')
      }

      // Submit the extracted content
      onSubmit(data.content)
      setUrl('')
      setIsValid(false)
    } catch (err) {
      console.error('Failed to fetch URL:', err)
      toast.error('Failed to Fetch', {
        description: err instanceof Error ? err.message : 'Could not retrieve content from the URL. Please try again.',
        duration: 3000,
      })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isValid) {
      handleSubmit()
    }
  }

  return (
    <div className="sound-input-container">
      <motion.div
        className="sound-input-dock"
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
          <XIcon size={24} weight="duotone" />
        </button>

        {/* Link Input */}
        <input
          type="text"
          className={`text-input-field link-input ${isValid ? 'valid' : ''}`}
          value={url}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Paste URL here..."
          autoFocus
        />

        {/* Submit Button */}
        <button
          className="dock-button submit"
          onClick={handleSubmit}
          title="Submit Link"
          disabled={!isValid}
        >
          <ArrowFatUpIcon size={28} weight="bold" />
        </button>
      </motion.div>
    </div>
  )
}
