/**
 * SkeletonWrapper Component
 *
 * Wrapper component that provides theme configuration for all skeleton components.
 * Should be placed high in the component tree (typically in App.tsx or main.tsx).
 *
 * @example
 * // In App.tsx
 * <SkeletonWrapper>
 *   <App />
 * </SkeletonWrapper>
 *
 * @example
 * // With custom theme
 * <SkeletonWrapper
 *   baseColor="#f5f5f5"
 *   highlightColor="#e0e0e0"
 *   borderRadius={12}
 * >
 *   <App />
 * </SkeletonWrapper>
 */

import type { ReactNode } from 'react'
import { SkeletonTheme } from 'react-loading-skeleton'
import type { SkeletonThemeConfig } from './types'
import { useTheme } from '../../theme'
import 'react-loading-skeleton/dist/skeleton.css'

interface SkeletonWrapperProps extends Partial<SkeletonThemeConfig> {
  children: ReactNode
}

export function SkeletonWrapper({
  children,
  baseColor,
  highlightColor,
  borderRadius = 8,
  duration = 1.5,
  direction = 'ltr',
  enableAnimation = true
}: SkeletonWrapperProps) {
  const { theme } = useTheme()

  // Use theme colors or fall back to provided props
  const effectiveBaseColor = baseColor || theme.skeletonBackground
  const effectiveHighlightColor = highlightColor || theme.skeletonBorder

  return (
    <SkeletonTheme
      baseColor={effectiveBaseColor}
      highlightColor={effectiveHighlightColor}
      borderRadius={borderRadius}
      duration={duration}
      direction={direction}
      enableAnimation={enableAnimation}
    >
      {children}
    </SkeletonTheme>
  )
}

/**
 * Hook to get current theme values
 * Useful for creating custom skeleton components
 */
export function useSkeletonTheme() {
  const { theme } = useTheme()

  return {
    baseColor: theme.skeletonBackground,
    highlightColor: theme.skeletonBorder,
    borderRadius: 8,
    duration: 1.5,
    direction: 'ltr' as const,
    enableAnimation: true
  }
}
