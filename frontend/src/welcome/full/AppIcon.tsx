import { Logo } from '../../components/Logo'
import './AppIcon.css'

interface AppIconProps {
  size?: number
  className?: string
}

/**
 * App icon component - square with rounded corners containing the logo
 * Background is primary color, logo is white
 */
export function AppIcon({ size = 80, className = '' }: AppIconProps) {
  const logoSize = Math.round(size * 0.65) // Logo is 65% of container size
  const borderRadius = Math.round(size * 0.22) // ~22% for iOS-style rounding

  return (
    <div
      className={`app-icon ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${borderRadius}px`,
      }}
    >
      <Logo size={logoSize} className="app-icon-logo" />
    </div>
  )
}
