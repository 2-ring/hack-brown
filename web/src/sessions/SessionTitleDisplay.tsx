/**
 * SessionTitleDisplay Component
 *
 * Displays session title with real-time streaming updates:
 * 1. Shows skeleton while title is being generated
 * 2. Smoothly transitions to typing animation when title arrives
 * 3. Displays final title once animation completes
 *
 * @example
 * <SessionTitleDisplay sessionId={session.id} fallbackTitle="New Session" />
 */

import { useSessionTitleStream } from './useSessionTitleStream'
import { TypingText } from '../components/TypingText'
import Skeleton from 'react-loading-skeleton'

interface SessionTitleDisplayProps {
  /** Session ID to stream title from */
  sessionId: string
  /** Fallback title to show if streaming fails */
  fallbackTitle: string
  /** Custom className */
  className?: string
  /** Whether to show typing animation (default: true) */
  enableTypingAnimation?: boolean
  /** Typing speed in ms per character (default: 30) */
  typingSpeed?: number
  /** Callback when title is fully displayed */
  onTitleComplete?: (title: string) => void
}

export function SessionTitleDisplay({
  sessionId,
  fallbackTitle,
  className = '',
  enableTypingAnimation = true,
  typingSpeed = 30,
  onTitleComplete
}: SessionTitleDisplayProps) {
  const { title, isLoading, error } = useSessionTitleStream(sessionId, onTitleComplete)

  // Show skeleton while loading
  if (isLoading && !title) {
    return (
      <div className={`session-title-display ${className}`.trim()}>
        <Skeleton width="80%" height={16} />
      </div>
    )
  }

  // Show error fallback if stream failed
  if (error) {
    return (
      <div className={`session-title-display ${className}`.trim()}>
        {fallbackTitle}
      </div>
    )
  }

  // Show typing animation when title arrives
  if (title && enableTypingAnimation) {
    return (
      <div className={`session-title-display typing-text-enter ${className}`.trim()}>
        <TypingText
          text={title}
          speed={typingSpeed}
          onComplete={() => onTitleComplete && onTitleComplete(title)}
        />
      </div>
    )
  }

  // Fallback: show title or fallback
  return (
    <div className={`session-title-display ${className}`.trim()}>
      {title || fallbackTitle}
    </div>
  )
}
