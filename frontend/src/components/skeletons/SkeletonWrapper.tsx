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

import { ReactNode } from 'react'
import { SkeletonTheme } from 'react-loading-skeleton'
import type { SkeletonThemeConfig } from './types'
import 'react-loading-skeleton/dist/skeleton.css'

interface SkeletonWrapperProps extends SkeletonThemeConfig {
  children: ReactNode
}

// Default theme configuration matching your design system
const DEFAULT_THEME: Required<Omit<SkeletonThemeConfig, 'children'>> = {
  baseColor: '#f0f0f0',
  highlightColor: '#e0e0e0',
  borderRadius: 8,
  duration: 1.5,
  direction: 'ltr',
  enableAnimation: true
}

export function SkeletonWrapper({
  children,
  baseColor = DEFAULT_THEME.baseColor,
  highlightColor = DEFAULT_THEME.highlightColor,
  borderRadius = DEFAULT_THEME.borderRadius,
  duration = DEFAULT_THEME.duration,
  direction = DEFAULT_THEME.direction,
  enableAnimation = DEFAULT_THEME.enableAnimation
}: SkeletonWrapperProps) {
  return (
    <SkeletonTheme
      baseColor={baseColor}
      highlightColor={highlightColor}
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
export function useSkeletonTheme(): Required<Omit<SkeletonThemeConfig, 'children'>> {
  return DEFAULT_THEME
}
