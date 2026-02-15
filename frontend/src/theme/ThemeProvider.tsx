import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Theme, ThemeMode } from './types';
import { lightTheme } from './lightTheme';
import { darkTheme } from './darkTheme';
import { useAuth } from '../auth/AuthContext';
import { updateUserPreferences } from '../api/backend-client';
import { isNativePlatform } from '../utils/platform';
import { StatusBar, Style } from '@capacitor/status-bar';

interface ThemeContextType {
  theme: Theme;
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const applyCSSVariables = (theme: Theme) => {
  const root = document.documentElement;

  // Apply each theme property as a CSS variable
  Object.entries(theme).forEach(([key, value]) => {
    // Convert camelCase to kebab-case (e.g., primaryHover -> primary-hover)
    const cssVarName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(`--${cssVarName}`, value);
  });
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

const getSystemTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { session, setPreferences } = useAuth();

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    // Initialize from localStorage for instant load (no flash)
    const saved = localStorage.getItem('theme-mode');
    if (saved === 'dark' || saved === 'light' || saved === 'auto') return saved;
    // Default to auto
    return 'auto';
  });

  // Track the system preference for auto mode
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Theme is purely local — only changes when user clicks the toggle

  // Resolve auto to the actual system theme
  const resolvedTheme = themeMode === 'auto' ? systemTheme : themeMode;
  const theme = resolvedTheme === 'light' ? lightTheme : darkTheme;

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('theme-mode', mode);

    // Persist to backend if authenticated
    if (session) {
      setPreferences(prev => ({ ...prev, theme_mode: mode }));
      updateUserPreferences({ theme_mode: mode }).catch((err) => {
        console.error('Failed to save theme preference:', err);
      });
    }
  };

  const toggleTheme = () => {
    const next: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };
    setThemeMode(next[themeMode]);
  };

  useEffect(() => {
    // Apply CSS variables whenever theme changes
    applyCSSVariables(theme);

    // Add data attribute to body for theme-specific styling
    document.body.setAttribute('data-theme', resolvedTheme);

    // Sync native status bar style with theme
    if (isNativePlatform()) {
      StatusBar.setStyle({
        style: resolvedTheme === 'dark' ? Style.Dark : Style.Light,
      }).catch(() => {});
    }
  }, [theme, resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, themeMode, resolvedTheme, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
