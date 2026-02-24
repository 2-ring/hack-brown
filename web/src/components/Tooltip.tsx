/**
 * Tooltip Component
 *
 * A reusable tooltip component built with Radix UI for accessibility.
 * Styled to match the application's design system.
 *
 * Usage Example:
 *
 * ```tsx
 * import { Tooltip } from './components/Tooltip'
 *
 * // Basic usage
 * <Tooltip content="Close sidebar">
 *   <button>X</button>
 * </Tooltip>
 *
 * // With custom side
 * <Tooltip content="Save changes" side="bottom">
 *   <button>Save</button>
 * </Tooltip>
 *
 * // With custom delay
 * <Tooltip content="Delete item" delayDuration={500}>
 *   <button>Delete</button>
 * </Tooltip>
 * ```
 */

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import './Tooltip.css'

interface TooltipProps {
  /** The content to display in the tooltip */
  content: string
  /** The element that triggers the tooltip */
  children: React.ReactNode
  /** The side of the trigger to display the tooltip (default: "bottom") */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** The alignment of the tooltip relative to the trigger (default: "center") */
  align?: 'start' | 'center' | 'end'
  /** Duration in ms before tooltip appears (default: 700) */
  delayDuration?: number
  /** Whether to skip the delay when moving to another tooltip (default: 300) */
  skipDelayDuration?: number
}

export function Tooltip({
  content,
  children,
  side = 'bottom',
  align = 'center',
  delayDuration = 700,
  skipDelayDuration = 300,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            className="tooltip-content"
            side={side}
            align={align}
            sideOffset={8}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
