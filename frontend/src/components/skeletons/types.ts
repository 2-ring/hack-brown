/**
 * TypeScript types for skeleton loading components
 */

import type { CSSProperties } from 'react'

export interface SkeletonBaseProps {
  /** Custom className for styling */
  className?: string
  /** Custom inline styles */
  style?: CSSProperties
  /** Width of skeleton (number = px, string = any CSS unit) */
  width?: string | number
  /** Height of skeleton (number = px, string = any CSS unit) */
  height?: string | number
  /** Border radius (number = px, string = any CSS unit) */
  borderRadius?: string | number
  /** Whether skeleton is visible/loading */
  isLoading?: boolean
}

export interface SkeletonTextProps extends SkeletonBaseProps {
  /** Text variant */
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'label'
  /** Number of lines to show */
  lines?: number
  /** Width of last line (useful for multi-line skeletons) */
  lastLineWidth?: string | number
}

export interface SkeletonAvatarProps extends SkeletonBaseProps {
  /** Size of avatar */
  size?: 'small' | 'medium' | 'large' | number
  /** Shape of avatar */
  shape?: 'circle' | 'square' | 'rounded'
}

export interface SkeletonCardProps extends SkeletonBaseProps {
  /** Whether to show avatar */
  hasAvatar?: boolean
  /** Whether to show image/thumbnail */
  hasImage?: boolean
  /** Number of text lines */
  lines?: number
  /** Whether to show action buttons */
  hasActions?: boolean
}

export interface SkeletonListProps extends SkeletonBaseProps {
  /** Number of items in list */
  count?: number
  /** Render function for each item */
  renderItem?: (index: number) => React.ReactNode
  /** Gap between items (px) */
  gap?: number
}

export interface LoadingSpinnerProps {
  /** Size of spinner (small: 16px, medium: 24px, large: 32px, or custom number) */
  size?: 'small' | 'medium' | 'large' | number
  /** Color of spinner */
  color?: string
  /** Whether to show on light background (adjusts opacity) */
  light?: boolean
  /** Custom className */
  className?: string
  /** Accessible label */
  label?: string
}

export interface SkeletonThemeConfig {
  /** Base color for skeleton */
  baseColor?: string
  /** Highlight/shimmer color */
  highlightColor?: string
  /** Default border radius */
  borderRadius?: string | number
  /** Animation duration in seconds */
  duration?: number
  /** Animation direction */
  direction?: 'ltr' | 'rtl'
  /** Whether to enable animation */
  enableAnimation?: boolean
}
