/**
 * SkeletonCard Component
 *
 * Pre-built card skeleton for common card layouts.
 * Includes optional avatar, image, text lines, and action buttons.
 *
 * @example
 * // Basic card with 3 lines
 * <SkeletonCard lines={3} />
 *
 * @example
 * // Card with avatar and actions
 * <SkeletonCard hasAvatar hasActions lines={2} />
 *
 * @example
 * // Card with image thumbnail
 * <SkeletonCard hasImage lines={2} />
 */

import Skeleton from 'react-loading-skeleton'
import { SkeletonAvatar } from './SkeletonAvatar'
import { SkeletonText } from './SkeletonText'
import type { SkeletonCardProps } from './types'
import './skeleton.css'

export function SkeletonCard({
  hasAvatar = false,
  hasImage = false,
  lines = 3,
  hasActions = false,
  className = '',
  style,
  width,
  height,
  isLoading = true
}: SkeletonCardProps) {
  // If not loading, render nothing
  if (!isLoading) {
    return null
  }

  return (
    <div
      className={`skeleton-card ${className}`.trim()}
      style={{ width, height, ...style }}
    >
      {/* Optional image/thumbnail */}
      {hasImage && (
        <Skeleton height={180} borderRadius={8} style={{ marginBottom: 12 }} />
      )}

      {/* Header with optional avatar */}
      {hasAvatar && (
        <div className="skeleton-card-header">
          <SkeletonAvatar size="medium" />
          <div style={{ flex: 1 }}>
            <SkeletonText variant="body" width="60%" />
            <SkeletonText variant="caption" width="40%" />
          </div>
        </div>
      )}

      {/* Content lines */}
      {lines > 0 && (
        <div className="skeleton-card-content">
          {!hasAvatar && (
            <SkeletonText variant="h3" width="70%" />
          )}
          <SkeletonText variant="body" lines={lines} lastLineWidth="80%" />
        </div>
      )}

      {/* Optional action buttons */}
      {hasActions && (
        <div className="skeleton-card-actions">
          <Skeleton width={80} height={36} borderRadius={8} />
          <Skeleton width={80} height={36} borderRadius={8} />
        </div>
      )}
    </div>
  )
}

/**
 * SkeletonEventCard
 *
 * Specialized skeleton for calendar event cards (matches your Event component)
 */
export function SkeletonEventCard({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`skeleton-card ${className}`.trim()}
      style={style}
    >
      {/* Title */}
      <Skeleton height={28} borderRadius={8} style={{ marginBottom: 12 }} />

      {/* Date */}
      <Skeleton height={20} width="60%" borderRadius={8} style={{ marginBottom: 12 }} />

      {/* Description - 2 lines */}
      <SkeletonText variant="body" lines={2} height={18} />
    </div>
  )
}

/**
 * SkeletonProfileCard
 *
 * Specialized skeleton for user profile cards
 */
export function SkeletonProfileCard({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`skeleton-card ${className}`.trim()}
      style={style}
    >
      {/* Center-aligned avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <SkeletonAvatar size={64} />
        <SkeletonText variant="h3" width={120} />
        <SkeletonText variant="caption" width={160} />
      </div>

      {/* Stats or bio */}
      <div style={{ marginTop: 16 }}>
        <SkeletonText variant="body" lines={2} lastLineWidth="90%" />
      </div>
    </div>
  )
}
