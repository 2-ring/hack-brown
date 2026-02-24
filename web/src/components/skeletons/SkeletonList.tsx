/**
 * SkeletonList Component
 *
 * Renders a list of skeleton items with consistent spacing.
 * Supports custom render functions for flexibility.
 *
 * @example
 * // Simple list of 5 text skeletons
 * <SkeletonList count={5} renderItem={() => <SkeletonText />} />
 *
 * @example
 * // List of card skeletons
 * <SkeletonList count={3} gap={16} renderItem={() => <SkeletonCard lines={2} />} />
 *
 * @example
 * // List with different items based on index
 * <SkeletonList
 *   count={5}
 *   renderItem={(index) => (
 *     <div>
 *       <SkeletonAvatar size="small" />
 *       <SkeletonText width={`${80 - index * 10}%`} />
 *     </div>
 *   )}
 * />
 */

import { Fragment } from 'react'
import type { ReactNode } from 'react'
import type { SkeletonListProps } from './types'
import './skeleton.css'

export function SkeletonList({
  count = 3,
  renderItem,
  gap = 12,
  className = '',
  style,
  isLoading = true
}: SkeletonListProps) {
  // If not loading, render nothing
  if (!isLoading) {
    return null
  }

  return (
    <div
      className={`skeleton-list ${className}`.trim()}
      style={{ gap: `${gap}px`, ...style }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Fragment key={index}>
          {renderItem ? renderItem(index) : null}
        </Fragment>
      ))}
    </div>
  )
}

/**
 * SkeletonTable
 *
 * Table skeleton with rows and columns
 */
interface SkeletonTableProps {
  /** Number of rows */
  rows?: number
  /** Number of columns */
  columns?: number
  /** Whether to show header row */
  hasHeader?: boolean
  /** Custom className */
  className?: string
  /** Custom style */
  style?: React.CSSProperties
  /** Whether skeleton is loading */
  isLoading?: boolean
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  hasHeader = true,
  className = '',
  style,
  isLoading = true
}: SkeletonTableProps) {
  if (!isLoading) {
    return null
  }

  const renderRow = (isHeader: boolean = false) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: '12px',
        padding: '12px',
        borderBottom: '1px solid #f0f0f0'
      }}
    >
      {Array.from({ length: columns }).map((_, colIndex) => (
        <div key={colIndex}>
          {isHeader ? (
            <div style={{ height: 16, background: '#f0f0f0', borderRadius: 4 }} />
          ) : (
            <div style={{ height: 20, background: '#f0f0f0', borderRadius: 4, width: `${60 + Math.random() * 40}%` }} />
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div
      className={`skeleton-table ${className}`.trim()}
      style={{
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        overflow: 'hidden',
        ...style
      }}
    >
      {hasHeader && renderRow(true)}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <Fragment key={rowIndex}>{renderRow(false)}</Fragment>
      ))}
    </div>
  )
}

/**
 * SkeletonGrid
 *
 * Grid layout skeleton
 */
interface SkeletonGridProps {
  /** Number of items */
  count?: number
  /** Number of columns */
  columns?: number
  /** Gap between items */
  gap?: number
  /** Render function for each item */
  renderItem?: (index: number) => ReactNode
  /** Custom className */
  className?: string
  /** Custom style */
  style?: React.CSSProperties
  /** Whether skeleton is loading */
  isLoading?: boolean
}

export function SkeletonGrid({
  count = 6,
  columns = 3,
  gap = 16,
  renderItem,
  className = '',
  style,
  isLoading = true
}: SkeletonGridProps) {
  if (!isLoading) {
    return null
  }

  return (
    <div
      className={`skeleton-grid ${className}`.trim()}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`,
        ...style
      }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Fragment key={index}>
          {renderItem ? renderItem(index) : <div style={{ height: 200, background: '#f0f0f0', borderRadius: 8 }} />}
        </Fragment>
      ))}
    </div>
  )
}
