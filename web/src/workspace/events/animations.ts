import type { Variants } from 'framer-motion'

/**
 * Centralized animation configurations for EventsWorkspace
 *
 * This file contains all animation variants used throughout the events workspace.
 * Animations use Framer Motion for smooth, GPU-accelerated transitions.
 *
 * Key concepts:
 * - Container variants control staggerChildren timing
 * - Child variants define individual item animations
 * - Use transform properties (scale, x, y) and opacity for performance
 */

// Container animation for the event list
export const listContainerVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1, // Reverse stagger on exit
    },
  },
}

// Individual event card animation with ripple effect
export const eventItemVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 350,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    transition: {
      duration: 0.2,
      ease: 'easeInOut',
    },
  },
}

// Edit view container animation - controls staggered children
export const editViewVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
}

// Individual edit section animation - ripple effect for each section
export const editSectionVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.94,
    y: 15,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 350,
      damping: 28,
      mass: 0.6,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -8,
    transition: {
      duration: 0.2,
      ease: 'easeInOut',
    },
  },
}

// Date header animation - subtle fade and slide
export const dateHeaderVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -5,
    transition: {
      duration: 0.15,
    },
  },
}
