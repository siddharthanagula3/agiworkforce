const mobileNativeColors = {
  light: {
    terraCotta: '#111111',
    teal: '#111111',
    warmPeach: '#ececec',
    background: '#ffffff',
    surfaceBase: '#f7f7f7',
    surfaceElevated: '#ffffff',
    surfaceOverlay: '#ffffff',
    surfaceHover: '#ececec',
    textPrimary: '#111111',
    textSecondary: 'rgba(17, 17, 17, 0.72)',
    textMuted: 'rgba(17, 17, 17, 0.48)',
    border: 'rgba(17, 17, 17, 0.09)',
    borderLight: 'rgba(17, 17, 17, 0.06)',
    charcoal900: '#f7f7f7',
    charcoal800: '#eeeeee',
    charcoal700: '#dddddd',
    agentThinking: '#8b5cf6',
    agentActive: '#2563eb',
    agentSuccess: '#10a37f',
    agentError: '#dc2626',
    agentWarning: '#d97706',
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
    scrim: 'rgba(0, 0, 0, 0.46)',
  },
  dark: {
    terraCotta: '#10a37f',
    teal: '#10a37f',
    warmPeach: '#2f2f2f',
    background: '#0f0f0f',
    surfaceBase: '#171717',
    surfaceElevated: '#212121',
    surfaceOverlay: '#2a2a2a',
    surfaceHover: '#303030',
    textPrimary: '#f4f4f4',
    textSecondary: 'rgba(244, 244, 244, 0.74)',
    textMuted: 'rgba(244, 244, 244, 0.48)',
    border: 'rgba(255, 255, 255, 0.10)',
    borderLight: 'rgba(255, 255, 255, 0.06)',
    charcoal900: '#111111',
    charcoal800: '#1f1f1f',
    charcoal700: '#2f2f2f',
    agentThinking: '#a78bfa',
    agentActive: '#60a5fa',
    agentSuccess: '#10a37f',
    agentError: '#f87171',
    agentWarning: '#fbbf24',
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
    scrim: 'rgba(0, 0, 0, 0.62)',
  },
} as const;

export const colors = mobileNativeColors.dark;
export const lightColors = mobileNativeColors.light;

export type ColorScheme = {
  [K in keyof typeof mobileNativeColors.dark]: string;
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
