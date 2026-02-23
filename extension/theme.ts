// Theme management for the browser extension.
// Mirrors the frontend's ThemeProvider behavior: reads the user's theme_mode
// preference ('light' | 'dark' | 'auto') and applies matching CSS variables.

import { storage } from './compat';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'themeMode';

// ===== System preference detection =====

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ===== Apply theme to document =====

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved);
}

// ===== Resolve mode → actual theme =====

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === 'auto' ? getSystemTheme() : mode;
}

// ===== Public API =====

/**
 * Initialize theming for a popup or sidebar page.
 * - Reads the stored theme_mode from storage.local
 * - Applies the resolved theme immediately
 * - Listens for storage changes (background updates theme_mode on auth)
 * - Listens for system theme changes when mode is 'auto'
 */
export function initTheme(): void {
  // 1. Apply immediately from storage
  storage.local.get(STORAGE_KEY, (result) => {
    const mode: ThemeMode = result[STORAGE_KEY] || 'auto';
    applyTheme(resolve(mode));
  });

  // 2. Listen for theme_mode changes in storage (e.g. background fetched new prefs)
  storage.local.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      const mode: ThemeMode = changes[STORAGE_KEY].newValue || 'auto';
      applyTheme(resolve(mode));
    }
  });

  // 3. Listen for OS-level theme changes (matters when mode === 'auto')
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    storage.local.get(STORAGE_KEY, (result) => {
      const mode: ThemeMode = result[STORAGE_KEY] || 'auto';
      if (mode === 'auto') {
        applyTheme(getSystemTheme());
      }
    });
  });
}
