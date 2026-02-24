/**
 * LoadingSpinner Component
 *
 * Unified loading spinner to replace all custom CSS spinners.
 * Supports multiple sizes, colors, and accessibility features.
 *
 * @example
 * // Basic usage
 * <LoadingSpinner />
 *
 * @example
 * // Custom size and color
 * <LoadingSpinner size="large" color="#4285f4" />
 *
 * @example
 * // Light background variant
 * <LoadingSpinner light />
 */

import type { CSSProperties } from 'react'
import type { LoadingSpinnerProps } from './types'
import './skeleton.css'

export function LoadingSpinner({
  size = 'medium',
  color,
  light = false,
  className = '',
  label = 'Loading...'
}: LoadingSpinnerProps) {
  // Size mapping
  const sizeMap = {
    small: 16,
    medium: 24,
    large: 32
  }

  const sizeValue = typeof size === 'number' ? size : sizeMap[size]

  // Default colors
  const defaultColor = light ? '#ffffff' : '#333333'
  const borderTopColor = color || defaultColor
  const borderOtherColor = light
    ? 'rgba(255, 255, 255, 0.3)'
    : 'rgba(0, 0, 0, 0.1)'

  const style: CSSProperties = {
    width: sizeValue,
    height: sizeValue,
    borderWidth: Math.max(2, Math.round(sizeValue / 8)),
    borderColor: borderOtherColor,
    borderTopColor: borderTopColor,
    borderStyle: 'solid'
  }

  // Determine size class
  let sizeClass = 'loading-spinner-medium'
  if (typeof size === 'string') {
    sizeClass = `loading-spinner-${size}`
  }

  return (
    <div
      className={`loading-spinner ${sizeClass} ${className}`.trim()}
      style={style}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
    </div>
  )
}

/**
 * LoadingSpinnerContainer
 *
 * Centered container for loading spinner.
 * Useful for replacing entire sections during loading.
 */
interface LoadingSpinnerContainerProps extends LoadingSpinnerProps {
  /** Minimum height of container */
  minHeight?: string | number
}

export function LoadingSpinnerContainer({
  minHeight,
  ...spinnerProps
}: LoadingSpinnerContainerProps) {
  const style: CSSProperties = minHeight
    ? { minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight }
    : {}

  return (
    <div className="loading-spinner-container" style={style}>
      <LoadingSpinner {...spinnerProps} />
    </div>
  )
}
