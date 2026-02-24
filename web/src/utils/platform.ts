import { Capacitor } from '@capacitor/core';

/**
 * Returns true when running inside a native iOS/Android shell (Capacitor).
 * Returns false when running in a regular web browser.
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Returns the current platform: 'ios', 'android', or 'web'.
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}
