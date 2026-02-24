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

  warning: string;
  warningLight: string;
  warningBackground: string;

  info: string;
  infoLight: string;
  infoBackground: string;

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

  // Gradients for fade effects
  gradientFade0: string;
  gradientFade40: string;
  gradientFade65: string;
  gradientFade85: string;
  gradientFade100: string;

  // Typography
  displayFont: string;
}

export type ThemeMode = 'light' | 'dark' | 'auto';
