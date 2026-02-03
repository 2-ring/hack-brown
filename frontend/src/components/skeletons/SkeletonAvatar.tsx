/**
 * SkeletonAvatar Component
 *
 * Avatar skeleton with predefined sizes and shapes.
 * Perfect for user profiles, contact lists, etc.
 *
 * @example
 * // Default circle avatar
 * <SkeletonAvatar />
 *
 * @example
 * // Large square avatar
 * <SkeletonAvatar size="large" shape="square" />
 *
 * @example
 * // Custom size
 * <SkeletonAvatar size={64} shape="circle" />
 */

import Skeleton from 'react-loading-skeleton'
import type { SkeletonAvatarProps } from './types'
import './skeleton.css'

// Size presets (in px)
const SIZE_PRESETS = {
  small: 24,
  medium: 32,
  large: 48
} as const

// Border radius for shapes
const SHAPE_RADIUS = {
  circle: '50%',
  square: '0',
  rounded: '8px'
} as const

export function SkeletonAvatar({
  size = 'medium',
  shape = 'circle',
  className = '',
  style,
  width,
  height,
  borderRadius,
  isLoading = true
}: SkeletonAvatarProps) {
  // If not loading, render nothing
  if (!isLoading) {
    return null
  }

  // Calculate dimensions
  const sizeValue = typeof size === 'number' ? size : SIZE_PRESETS[size]
  const calculatedWidth = width || sizeValue
  const calculatedHeight = height || sizeValue
  const calculatedRadius = borderRadius || SHAPE_RADIUS[shape]

  // Shape class
  const shapeClass = `skeleton-avatar-${shape}`

  return (
    <Skeleton
      circle={shape === 'circle'}
      width={calculatedWidth}
      height={calculatedHeight}
      borderRadius={calculatedRadius}
      className={`${shapeClass} ${className}`.trim()}
      style={style}
    />
  )
}

/**
 * SkeletonAvatarGroup
 *
 * Group of overlapping avatars (common in collaboration UIs)
 */
interface SkeletonAvatarGroupProps {
  /** Number of avatars to show */
  count?: number
  /** Size of each avatar */
  size?: SkeletonAvatarProps['size']
  /** Overlap amount in pixels */
  overlap?: number
  /** Custom className */
  className?: string
}

export function SkeletonAvatarGroup({
  count = 3,
  size = 'medium',
  overlap = 8,
  className = ''
}: SkeletonAvatarGroupProps) {
  return (
    <div
      className={`skeleton-avatar-group ${className}`.trim()}
      style={{ display: 'flex', alignItems: 'center' }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          style={{
            marginLeft: index > 0 ? -overlap : 0,
            zIndex: count - index
          }}
        >
          <SkeletonAvatar size={size} />
        </div>
      ))}
    </div>
  )
}
