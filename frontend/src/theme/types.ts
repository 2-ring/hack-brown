export type Theme = {
  // Primary Brand Colors
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryLight: string;
  primaryFaint: string;

  // Background Colors
  background: string;
  backgroundSecondary: string;
  backgroundHover: string;
  backgroundActive: string;
  backgroundElevated: string;

  // Text Colors
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;

  // Border Colors
  border: string;
  borderHover: string;
  borderActive: string;
  borderLight: string;

  // State Colors
  success: string;
  successLight: string;
  successBorder: string;
  successBackground: string;

  error: string;
  errorLight: string;
  errorBackground: string;

  // Interactive Colors
  interactive: string;
  interactiveLight: string;
  interactiveHover: string;

  // Overlay Colors
  shadowLight: string;
  shadowMedium: string;
  shadowHeavy: string;
  overlay: string;

  // Component-specific
  tooltipBackground: string;
  tooltipText: string;
  skeletonBackground: string;
  skeletonBorder: string;
  toggleActive: string;
  toggleInactive: string;
}

export type ThemeMode = 'light' | 'dark';
