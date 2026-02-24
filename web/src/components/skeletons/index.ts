/**
 * Skeleton Loading System
 *
 * A comprehensive, centralized skeleton loading system built on react-loading-skeleton.
 * Provides consistent loading states throughout the application.
 *
 * ## Quick Start
 *
 * 1. Wrap your app with SkeletonWrapper (in App.tsx or main.tsx):
 *    ```tsx
 *    import { SkeletonWrapper } from './components/skeletons'
 *
 *    <SkeletonWrapper>
 *      <App />
 *    </SkeletonWrapper>
 *    ```
 *
 * 2. Use skeleton components in your UI:
 *    ```tsx
 *    import { SkeletonText, SkeletonCard, LoadingSpinner } from './components/skeletons'
 *
 *    function MyComponent({ isLoading, data }) {
 *      if (isLoading) return <SkeletonCard />
 *      return <div>{data}</div>
 *    }
 *    ```
 *
 * 3. Use hooks for advanced patterns:
 *    ```tsx
 *    import { useLoadingDelay } from './components/skeletons'
 *
 *    const showSkeleton = useLoadingDelay(isLoading, 300)
 *    ```
 *
 * ## Components
 *
 * - **LoadingSpinner** - Unified spinner for all loading indicators
 * - **SkeletonWrapper** - Theme provider (wrap your app)
 * - **SkeletonText** - Text placeholders with variants (h1, h2, body, etc.)
 * - **SkeletonAvatar** - Avatar placeholders (circle, square, rounded)
 * - **SkeletonCard** - Pre-built card skeletons
 * - **SkeletonList** - List/grid layouts
 *
 * ## Hooks
 *
 * - **useLoadingState** - Simple loading state management
 * - **useLoadingDelay** - Prevent flash of loading content
 * - **useMinimumLoadingTime** - Ensure minimum loading duration
 * - **useProgressiveLoading** - Streaming/progressive loading
 * - **useSkeletonCount** - Calculate skeleton count
 *
 * ## Best Practices
 *
 * 1. Each component should handle its own skeleton state
 * 2. Match skeleton layout to actual content exactly
 * 3. Use semantic variants (h1, h2, body) for consistency
 * 4. Add aria-busy and aria-live for accessibility
 * 5. Use loading delays to prevent flashing (<300ms operations)
 */

// Core components
export { SkeletonWrapper, useSkeletonTheme } from './SkeletonWrapper'
export { LoadingSpinner, LoadingSpinnerContainer } from './LoadingSpinner'

// Skeleton components
export { SkeletonText, SkeletonHeading, SkeletonParagraph } from './SkeletonText'
export { SkeletonAvatar, SkeletonAvatarGroup } from './SkeletonAvatar'
export {
  SkeletonCard,
  SkeletonEventCard,
  SkeletonProfileCard
} from './SkeletonCard'
export {
  SkeletonList,
  SkeletonTable,
  SkeletonGrid
} from './SkeletonList'
export {
  SkeletonSessionItem,
  SkeletonSessionGroup
} from './SkeletonSessionItem'

// Hooks
export {
  useLoadingState,
  useLoadingDelay,
  useMinimumLoadingTime,
  useSkeletonCount,
  useProgressiveLoading,
  useLoadingTimeout,
  useIncrementalLoading
} from './hooks'

// Types
export type {
  SkeletonBaseProps,
  SkeletonTextProps,
  SkeletonAvatarProps,
  SkeletonCardProps,
  SkeletonListProps,
  LoadingSpinnerProps,
  SkeletonThemeConfig
} from './types'

// Re-export Skeleton from react-loading-skeleton for custom use cases
export { default as Skeleton } from 'react-loading-skeleton'
