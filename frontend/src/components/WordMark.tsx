import { Logo } from './Logo'
import { useTheme } from '../theme/ThemeProvider'
import wordImageLight from '../assets/brand/light/word.png'
import wordImageDark from '../assets/brand/dark/word.png'
import './WordMark.css'

interface WordMarkProps {
  /** Size of the mark (logo icon) in pixels. Word height is scaled proportionally. */
  size?: number
  /** Optional class name for additional styling */
  className?: string
}

/**
 * Combined mark + word component that handles theming and scaling.
 * Replaces all instances where Logo and word image are used together.
 */
export function WordMark({ size = 32, className = '' }: WordMarkProps) {
  const { themeMode } = useTheme()

  // Select word image based on theme
  const wordImage = themeMode === 'dark' ? wordImageDark : wordImageLight

  // Calculate proportional word height based on mark size
  // Default ratio: 32px mark → 32px word, 48px mark → 38px word
  // This gives us approximately: wordHeight = markSize * 1.1875 - 6
  // Simplified: wordHeight ≈ markSize + (markSize * 0.1875) - 6
  const wordHeight = size <= 32 ? size : Math.round(size + (size * 0.1875) - 6)

  // Calculate gap as 25% of mark size (matches --brand-logo-gap)
  const gap = Math.round(size * 0.25)

  return (
    <div
      className={`wordmark ${className}`}
      style={{
        '--wm-mark': `${size}px`,
        '--wm-word': `${wordHeight}px`,
        '--wm-gap': `${gap}px`,
      } as React.CSSProperties}
    >
      <Logo size={size} />
      <img
        src={wordImage}
        alt="DropCal"
        className="wordmark-word"
      />
    </div>
  )
}
