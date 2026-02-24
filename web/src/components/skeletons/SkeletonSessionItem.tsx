/**
 * SkeletonSessionItem Component
 *
 * Simplified skeleton for session list items in the Menu sidebar.
 * Just a rounded box with optional opacity for fade effect.
 *
 * @example
 * <SkeletonSessionItem />
 *
 * @example
 * // With fade effect
 * <SkeletonSessionItem opacity={0.6} />
 */

import Skeleton from 'react-loading-skeleton'
import './skeleton.css'

interface SkeletonSessionItemProps {
  /** Custom className */
  className?: string
  /** Opacity for fade effect (0-1) */
  opacity?: number
}

export function SkeletonSessionItem({
  className = '',
  opacity = 1
}: SkeletonSessionItemProps) {
  return (
    <div
      className={`skeleton-session-item ${className}`.trim()}
      style={{ opacity }}
    >
      <div style={{ padding: '8px 12px' }}>
        <Skeleton height={36} borderRadius={8} />
      </div>
    </div>
  )
}

/**
 * SkeletonSessionGroup
 *
 * Skeleton for a group of session items with label and fade effect
 */
interface SkeletonSessionGroupProps {
  /** Number of items in group */
  count?: number
  /** Whether to show group label */
  showLabel?: boolean
  /** Custom className */
  className?: string
  /** Enable fade effect (opacity decreases down the list) */
  fade?: boolean
}

export function SkeletonSessionGroup({
  count = 3,
  showLabel = true,
  className = '',
  fade = true
}: SkeletonSessionGroupProps) {
  return (
    <div className={`skeleton-session-group ${className}`.trim()}>
      {/* Group label */}
      {showLabel && (
        <div style={{ padding: '8px 12px', marginBottom: '4px' }}>
          <Skeleton width={60} height={12} />
        </div>
      )}

      {/* Session items with fade effect */}
      {Array.from({ length: count }).map((_, index) => {
        // Calculate opacity: starts at 1.0, decreases to 0.3
        const opacity = fade ? 1 - (index / count) * 0.7 : 1
        return <SkeletonSessionItem key={index} opacity={opacity} />
      })}
    </div>
  )
}
