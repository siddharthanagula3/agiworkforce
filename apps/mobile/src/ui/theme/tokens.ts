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
    accentSurface: 'rgba(17, 17, 17, 0.08)',
    accentBorder: 'rgba(17, 17, 17, 0.16)',
    accentText: '#ffffff',
    inputSurface: 'rgba(17, 17, 17, 0.03)',
    composerBorder: 'rgba(17, 17, 17, 0.08)',
    successSurface: 'rgba(16, 163, 127, 0.08)',
    successBorder: 'rgba(16, 163, 127, 0.35)',
    warningSurface: 'rgba(217, 119, 6, 0.12)',
    warningBorder: 'rgba(217, 119, 6, 0.28)',
    dangerSurface: 'rgba(220, 38, 38, 0.10)',
    dangerBorder: 'rgba(220, 38, 38, 0.28)',
    neutralSurface: 'rgba(17, 17, 17, 0.08)',
    neutralBorder: 'rgba(17, 17, 17, 0.16)',
    purple: '#7c3aed',
    purpleSurface: 'rgba(124, 58, 237, 0.12)',
    progressTrack: 'rgba(17, 17, 17, 0.08)',
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
    scrim: 'rgba(0, 0, 0, 0.46)',
  },
  dark: {
    terraCotta: '#f4f4f4',
    teal: '#f4f4f4',
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
    accentSurface: 'rgba(244, 244, 244, 0.12)',
    accentBorder: 'rgba(244, 244, 244, 0.24)',
    accentText: '#000000',
    inputSurface: 'rgba(255, 255, 255, 0.04)',
    composerBorder: 'rgba(255, 255, 255, 0.08)',
    successSurface: 'rgba(16, 163, 127, 0.12)',
    successBorder: 'rgba(16, 163, 127, 0.36)',
    warningSurface: 'rgba(251, 191, 36, 0.14)',
    warningBorder: 'rgba(251, 191, 36, 0.30)',
    dangerSurface: 'rgba(248, 113, 113, 0.13)',
    dangerBorder: 'rgba(248, 113, 113, 0.32)',
    neutralSurface: 'rgba(255, 255, 255, 0.07)',
    neutralBorder: 'rgba(255, 255, 255, 0.12)',
    purple: '#a78bfa',
    purpleSurface: 'rgba(167, 139, 250, 0.14)',
    progressTrack: 'rgba(255, 255, 255, 0.08)',
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
