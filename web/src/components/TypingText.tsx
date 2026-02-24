/**
 * TypingText Component
 *
 * Renders text with a typewriter animation effect.
 * Perfect for revealing session titles as they're generated.
 *
 * @example
 * <TypingText text="MATH180 Midterm" speed={30} onComplete={() => console.log('Done!')} />
 */

import { useState, useEffect } from 'react'
import './TypingText.css'

interface TypingTextProps {
  /** Text to animate */
  text: string
  /** Typing speed in milliseconds per character (default: 50ms) */
  speed?: number
  /** Callback when animation completes */
  onComplete?: () => void
  /** Custom className */
  className?: string
  /** Start animation immediately (default: true) */
  startImmediately?: boolean
}

export function TypingText({
  text,
  speed = 50,
  onComplete,
  className = '',
  startImmediately = true
}: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    // Reset if text changes
    setDisplayedText('')
    setCurrentIndex(0)
    setIsComplete(false)
  }, [text])

  useEffect(() => {
    if (!startImmediately || isComplete || currentIndex >= text.length) {
      if (currentIndex >= text.length && !isComplete) {
        setIsComplete(true)
        if (onComplete) {
          onComplete()
        }
      }
      return
    }

    const timer = setTimeout(() => {
      setDisplayedText(prev => prev + text[currentIndex])
      setCurrentIndex(prev => prev + 1)
    }, speed)

    return () => clearTimeout(timer)
  }, [currentIndex, text, speed, onComplete, startImmediately, isComplete])

  return (
    <span className={className}>
      {displayedText}
      {!isComplete && <span className="typing-cursor">|</span>}
    </span>
  )
}

/**
 * CSS for typing cursor animation
 * Add this to your global CSS:
 *
 * .typing-cursor {
 *   animation: blink 1s step-end infinite;
 *   margin-left: 2px;
 * }
 *
 * @keyframes blink {
 *   50% { opacity: 0; }
 * }
 */
