/**
 * Custom hooks for skeleton loading states
 *
 * Provides convenient utilities for managing loading states
 * and rendering skeletons throughout your application.
 */

import { useState, useEffect, useCallback } from 'react'

/**
 * useLoadingState
 *
 * Simple hook to manage loading state with optional timeout.
 *
 * @example
 * const { isLoading, startLoading, stopLoading } = useLoadingState()
 */
export function useLoadingState(initialState = false) {
  const [isLoading, setIsLoading] = useState(initialState)

  const startLoading = useCallback(() => {
    setIsLoading(true)
  }, [])

  const stopLoading = useCallback(() => {
    setIsLoading(false)
  }, [])

  const toggleLoading = useCallback(() => {
    setIsLoading(prev => !prev)
  }, [])

  return {
    isLoading,
    startLoading,
    stopLoading,
    toggleLoading,
    setIsLoading
  }
}

/**
 * useLoadingDelay
 *
 * Delays showing loading state to prevent flash of loading content
 * for fast operations. Good UX practice from Material Design guidelines.
 *
 * @param isLoading - Current loading state
 * @param delay - Delay in milliseconds before showing loader (default: 300ms)
 *
 * @example
 * const showSkeleton = useLoadingDelay(isLoading, 300)
 * return showSkeleton ? <Skeleton /> : <Content />
 */
export function useLoadingDelay(isLoading: boolean, delay: number = 300): boolean {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    if (isLoading) {
      // Start a timer to show loading after delay
      const timer = setTimeout(() => {
        setShowLoading(true)
      }, delay)

      return () => clearTimeout(timer)
    } else {
      // Immediately hide loading when done
      setShowLoading(false)
    }
  }, [isLoading, delay])

  return showLoading
}

/**
 * useMinimumLoadingTime
 *
 * Ensures loading state is shown for a minimum duration to prevent
 * jarring flashes. Useful for operations that might complete very quickly.
 *
 * @param isLoading - Current loading state
 * @param minDuration - Minimum time to show loader (default: 500ms)
 *
 * @example
 * const showSkeleton = useMinimumLoadingTime(isLoading, 500)
 */
export function useMinimumLoadingTime(isLoading: boolean, minDuration: number = 500): boolean {
  const [showLoading, setShowLoading] = useState(isLoading)
  const [startTime, setStartTime] = useState<number | null>(null)

  useEffect(() => {
    if (isLoading) {
      // Mark when loading started
      setStartTime(Date.now())
      setShowLoading(true)
    } else if (startTime !== null) {
      // Calculate how long we've been loading
      const elapsed = Date.now() - startTime
      const remaining = minDuration - elapsed

      if (remaining > 0) {
        // Wait for the remaining time
        const timer = setTimeout(() => {
          setShowLoading(false)
          setStartTime(null)
        }, remaining)

        return () => clearTimeout(timer)
      } else {
        // Minimum time already elapsed
        setShowLoading(false)
        setStartTime(null)
      }
    }
  }, [isLoading, minDuration, startTime])

  return showLoading
}

/**
 * useSkeletonCount
 *
 * Helper to generate skeleton count based on expected items.
 * Useful for streaming/progressive loading scenarios.
 *
 * @param expectedCount - Expected number of items
 * @param loadedCount - Currently loaded items
 * @returns Number of skeletons to show
 *
 * @example
 * const skeletonCount = useSkeletonCount(10, events.length)
 * // Shows skeletons for remaining unloaded items
 */
export function useSkeletonCount(expectedCount: number, loadedCount: number): number {
  return Math.max(0, expectedCount - loadedCount)
}

/**
 * useProgressiveLoading
 *
 * Hook for progressive/streaming loading states where items load one by one.
 * Returns the appropriate skeleton configuration for the current state.
 *
 * @param totalItems - Total expected items
 * @param loadedItems - Currently loaded items
 *
 * @example
 * const { isLoading, skeletonCount, progress } = useProgressiveLoading(5, events.length)
 */
export function useProgressiveLoading(totalItems: number, loadedItems: number) {
  const isLoading = loadedItems < totalItems
  const skeletonCount = Math.max(0, totalItems - loadedItems)
  const progress = totalItems > 0 ? (loadedItems / totalItems) * 100 : 0

  return {
    isLoading,
    skeletonCount,
    progress,
    hasStarted: loadedItems > 0,
    isComplete: loadedItems >= totalItems
  }
}

/**
 * useLoadingTimeout
 *
 * Automatically stops loading after a timeout (safety measure for hanging requests)
 *
 * @param isLoading - Current loading state
 * @param timeout - Timeout in milliseconds (default: 30000ms = 30s)
 * @param onTimeout - Callback when timeout occurs
 *
 * @example
 * const safeLoading = useLoadingTimeout(isLoading, 30000, () => {
 *   console.error('Loading timeout')
 * })
 */
export function useLoadingTimeout(
  isLoading: boolean,
  timeout: number = 30000,
  onTimeout?: () => void
): boolean {
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (isLoading && !timedOut) {
      const timer = setTimeout(() => {
        setTimedOut(true)
        onTimeout?.()
      }, timeout)

      return () => clearTimeout(timer)
    } else if (!isLoading) {
      setTimedOut(false)
    }
  }, [isLoading, timeout, timedOut, onTimeout])

  return isLoading && !timedOut
}

/**
 * useIncrementalLoading
 *
 * Hook for showing skeletons that appear one by one with a stagger effect.
 * Returns the number of skeletons that should be visible at the current time.
 *
 * @param totalCount - Total number of items to load
 * @param staggerDelay - Delay between each skeleton appearing (ms)
 * @param isLoading - Whether currently loading
 *
 * @example
 * const visibleCount = useIncrementalLoading(5, 100, isLoading)
 * // Skeletons appear one by one with 100ms delay
 */
export function useIncrementalLoading(
  totalCount: number,
  staggerDelay: number = 100,
  isLoading: boolean = true
): number {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (!isLoading) {
      setVisibleCount(0)
      return
    }

    let currentCount = 0
    const timers: ReturnType<typeof setTimeout>[] = []

    for (let i = 0; i < totalCount; i++) {
      const timer = setTimeout(() => {
        currentCount++
        setVisibleCount(currentCount)
      }, i * staggerDelay)
      timers.push(timer)
    }

    return () => {
      timers.forEach(timer => clearTimeout(timer))
    }
  }, [totalCount, staggerDelay, isLoading])

  return visibleCount
}
