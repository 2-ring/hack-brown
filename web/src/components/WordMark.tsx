import { Logo } from './Logo'
import './WordMark.css'

interface WordMarkProps {
  /** Size of the mark (logo icon) in pixels. Text is scaled proportionally (0.9× mark). */
  size?: number
  /** Optional class name for additional styling */
  className?: string
  /** Optional theme override to force light, dark, or white mode */
  themeOverride?: 'light' | 'dark' | 'white'
}

/**
 * Combined mark + word component that handles theming and scaling.
 * Uses display-text styling for the "dropcal" text.
 */
export function WordMark({ size = 32, className = '', themeOverride }: WordMarkProps) {
  const isWhite = themeOverride === 'white'

  // Text font-size is 0.9× mark size (matches greeting row ratio: 48px icon / ~44px text)
  const fontSize = Math.round(size * 0.9)

  // Gap is 25% of mark size (matches --brand-logo-gap)
  const gap = Math.round(size * 0.25)

  return (
    <div
      className={`wordmark ${className}`}
      style={{
        '--wm-mark': `${size}px`,
        '--wm-font': `${fontSize}px`,
        '--wm-gap': `${gap}px`,
      } as React.CSSProperties}
    >
      <Logo
        size={size}
        color={isWhite ? '#ffffff' : themeOverride === 'dark' ? '#ffffff' : undefined}
      />
      <span
        className={`display-text wordmark-word${isWhite ? ' wordmark-word-white' : ''}`}
      >
        dropcal
      </span>
    </div>
  )
}
