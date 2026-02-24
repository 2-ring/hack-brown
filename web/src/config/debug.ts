/**
 * Debug logging config. Set to true to enable verbose logging for specific features.
 * Disable in production by setting to false.
 */
export const DEBUG = {
  guestSessions: true,
} as const

export function debugLog(feature: keyof typeof DEBUG, ...args: unknown[]) {
  if (DEBUG[feature]) {
    console.log(`[${feature}]`, ...args)
  }
}

export function debugError(feature: keyof typeof DEBUG, ...args: unknown[]) {
  if (DEBUG[feature]) {
    console.error(`[${feature}]`, ...args)
  }
}
