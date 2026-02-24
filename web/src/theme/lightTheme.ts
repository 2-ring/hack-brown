import type { Theme } from './types';

export const lightTheme: Theme = {
  // Primary Brand Colors
  primary: '#1170C5',
  primaryHover: '#0D5A9E',
  primaryActive: '#0e5a9d',
  primaryLight: '#0d5aa3',
  primaryFaint: 'rgba(17, 112, 197, 0.08)',

  // Background Colors
  background: '#ffffff',
  backgroundSecondary: '#fafafa',
  backgroundHover: '#f5f5f5',
  backgroundActive: '#f0f0f0',
  backgroundElevated: 'rgba(255, 255, 255, 0.98)',

  // Text Colors
  textPrimary: '#333333',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textDisabled: '#aaaaaa',

  // Border Colors
  border: '#e5e5e5',
  borderHover: '#d5d5d5',
  borderActive: '#e0e0e0',
  borderLight: 'rgba(0, 0, 0, 0.1)',

  // State Colors
  success: '#2e7d32',
  successLight: '#81c784',
  successBorder: '#a5d6a7',
  successBackground: '#e8f5e9',

  error: '#c41e3a',
  errorLight: '#a01729',
  errorBackground: 'rgba(196, 30, 58, 0.1)',

  warning: '#f59e0b',
  warningLight: '#fbbf24',
  warningBackground: 'rgba(245, 158, 11, 0.1)',

  info: '#666666',
  infoLight: '#999999',
  infoBackground: 'rgba(102, 102, 102, 0.05)',

  // Interactive Colors
  interactive: '#7C8FFF',
  interactiveLight: 'rgba(124, 143, 255, 0.06)',
  interactiveHover: 'rgba(124, 143, 255, 0.2)',

  // Overlay Colors
  shadowLight: 'rgba(0, 0, 0, 0.08)',
  shadowMedium: 'rgba(0, 0, 0, 0.15)',
  shadowHeavy: 'rgba(0, 0, 0, 0.25)',
  overlay: 'rgba(0, 0, 0, 0.05)',

  // Component-specific
  tooltipBackground: '#1a1a1a',
  tooltipText: '#ffffff',
  skeletonBackground: '#f0f0f0',
  skeletonBorder: '#fafafa',
  toggleActive: '#1a73e8',
  toggleInactive: '#dadce0',

  // Gradients for fade effects
  gradientFade0: 'rgba(255, 255, 255, 0)',
  gradientFade40: 'rgba(255, 255, 255, 0.5)',
  gradientFade65: 'rgba(255, 255, 255, 0.8)',
  gradientFade85: 'rgba(255, 255, 255, 0.95)',
  gradientFade100: 'rgba(255, 255, 255, 1)',

  // Typography
  displayFont: 'Chillax',
};
