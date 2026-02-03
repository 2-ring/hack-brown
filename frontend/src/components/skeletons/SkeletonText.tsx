/**
 * SkeletonText Component
 *
 * Text skeleton with predefined variants for common text styles.
 * Supports single and multi-line text skeletons.
 *
 * @example
 * // Heading skeleton
 * <SkeletonText variant="h1" />
 *
 * @example
 * // Multi-line paragraph
 * <SkeletonText variant="body" lines={3} lastLineWidth="70%" />
 *
 * @example
 * // Custom dimensions
 * <SkeletonText width={200} height={24} />
 */

import Skeleton from 'react-loading-skeleton'
import type { SkeletonTextProps } from './types'
import './skeleton.css'

// Height presets for text variants (in px)
const VARIANT_HEIGHTS = {
  h1: 36,
  h2: 32,
  h3: 28,
  body: 20,
  caption: 16,
  label: 14
} as const

// Default widths for variants (percentage)
const VARIANT_WIDTHS = {
  h1: '60%',
  h2: '70%',
  h3: '80%',
  body: '100%',
  caption: '90%',
  label: '40%'
} as const

export function SkeletonText({
  variant = 'body',
  lines = 1,
  lastLineWidth = '80%',
  width,
  height,
  borderRadius,
  className = '',
  style,
  isLoading = true
}: SkeletonTextProps) {
  // If not loading, render nothing
  if (!isLoading) {
    return null
  }

  // Determine dimensions
  const calculatedHeight = height || VARIANT_HEIGHTS[variant]
  const calculatedWidth = width || VARIANT_WIDTHS[variant]

  // Single line
  if (lines === 1) {
    return (
      <Skeleton
        height={calculatedHeight}
        width={calculatedWidth}
        borderRadius={borderRadius}
        className={className}
        style={style}
      />
    )
  }

  // Multi-line
  return (
    <div className={`skeleton-text-wrapper ${className}`.trim()} style={style}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={calculatedHeight}
          width={index === lines - 1 ? lastLineWidth : calculatedWidth}
          borderRadius={borderRadius}
          style={{ marginBottom: index === lines - 1 ? 0 : 8 }}
        />
      ))}
    </div>
  )
}

/**
 * SkeletonHeading
 * Convenient shorthand for heading skeletons
 */
export function SkeletonHeading({ level = 1, ...props }: Omit<SkeletonTextProps, 'variant'> & { level?: 1 | 2 | 3 }) {
  const variant = `h${level}` as 'h1' | 'h2' | 'h3'
  return <SkeletonText variant={variant} {...props} />
}

/**
 * SkeletonParagraph
 * Convenient shorthand for paragraph skeletons
 */
export function SkeletonParagraph({ lines = 3, ...props }: Omit<SkeletonTextProps, 'variant'>) {
  return <SkeletonText variant="body" lines={lines} {...props} />
}
