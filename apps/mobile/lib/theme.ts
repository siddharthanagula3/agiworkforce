/**
 * Design tokens matching the desktop app.
 * Used by components that need raw color values (e.g., Reanimated, SVG).
 */

export const colors = {
  // Brand
  terraCotta: '#da7756',
  teal: '#21808d',
  warmPeach: '#f5c1a9',

  // Surfaces (dark theme)
  background: '#0f0f0f',
  surfaceBase: '#0f0f0f',
  surfaceElevated: '#1a1a1a',
  surfaceOverlay: '#242424',
  surfaceHover: '#2e2e2e',

  // Charcoal
  charcoal900: '#1f2121',
  charcoal800: '#2a2c2c',
  charcoal700: '#363838',

  // Text
  textPrimary: '#f5f7fb',
  textSecondary: 'rgba(245, 247, 251, 0.75)',
  textMuted: 'rgba(245, 247, 251, 0.5)',

  // Borders
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.06)',

  // Agent status
  agentThinking: '#a855f7',
  agentActive: '#3b82f6',
  agentSuccess: '#10b981',
  agentError: '#ef4444',
  agentWarning: '#f59e0b',

  // Semantic
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const lightColors = {
  ...colors,
  background: '#ffffff',
  surfaceBase: '#ffffff',
  surfaceElevated: '#f5f5f5',
  surfaceOverlay: '#ebebeb',
  surfaceHover: '#e0e0e0',
  charcoal900: '#f0f0f0',
  charcoal800: '#e5e5e5',
  charcoal700: '#d4d4d4',
  textPrimary: '#1a1a1a',
  textSecondary: 'rgba(26, 26, 26, 0.75)',
  textMuted: 'rgba(26, 26, 26, 0.5)',
  border: 'rgba(0, 0, 0, 0.08)',
  borderLight: 'rgba(0, 0, 0, 0.06)',
} as const;

/**
 * A widened color map where string literal types are relaxed to plain `string`.
 * This allows `lightColors` (which overrides specific literal hex values) to
 * satisfy the same interface as the dark-mode `colors` object.
 */
export type ColorScheme = {
  [K in keyof typeof colors]: string;
};

export function getColors(
  mode: 'dark' | 'light' | 'system',
  systemScheme: string | null | undefined,
): ColorScheme {
  if (mode === 'system') {
    return systemScheme === 'light' ? lightColors : colors;
  }
  return mode === 'light' ? lightColors : colors;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  '3xl': 32,
  full: 9999,
} as const;
