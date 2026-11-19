import {
  agiMobileAccentSwatches,
  agiMobileColors,
  agiMobileHighContrastColors,
  agiMobileNotificationLedColors,
  agiRadii,
  agiChatTypography,
} from '@agiworkforce/design-tokens';

export const colors = agiMobileColors.dark;
export const lightColors = agiMobileColors.light;
export const chatTypography = agiChatTypography;

export type ColorScheme = {
  [K in keyof typeof agiMobileColors.dark]: string;
};

export const highContrastColors: ColorScheme = agiMobileHighContrastColors.dark;

export const highContrastLightColors: ColorScheme = agiMobileHighContrastColors.light;

// prettier-ignore
export type AccentToken = 'neutral' | 'blue' | 'cyan' | 'green' | 'lime' | 'yellow' | 'orange' | 'rose' | 'magenta' | 'violet';

const accentSwatches: Record<AccentToken, { light: string; dark: string }> =
  agiMobileAccentSwatches;

export function accentTokenFrom(value: unknown): AccentToken {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(accentSwatches, value)
    ? (value as AccentToken)
    : 'neutral';
}

export function getColors(
  mode: 'dark' | 'light' | 'system',
  systemScheme: string | null | undefined,
  highContrast = false,
): ColorScheme {
  const isLight = mode === 'light' || (mode === 'system' && systemScheme === 'light');
  if (highContrast) {
    return isLight ? highContrastLightColors : highContrastColors;
  }
  return isLight ? lightColors : colors;
}

export function getAccentSwatch(color: AccentToken, isDark: boolean): string {
  return isDark ? accentSwatches[color].dark : accentSwatches[color].light;
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

const rung = (size: keyof typeof agiRadii): number => Number.parseInt(agiRadii[size], 10);

export const radii = {
  sm: rung('sm'),
  md: rung('md'),
  lg: rung('lg'),
  xl: rung('xl'),
  '2xl': rung('2xl'),
  '3xl': rung('3xl'),
  full: rung('full'),
} as const;

export const dialogPadding = spacing['2xl'];

export const loadingMarkSizes = { small: 20, large: 36 } as const;

export const typeScale = {
  caption: 14,
  footnote: 14,
  subhead: 14,
  body: 15,
  callout: 16,
  headline: 17,
  title3: 20,
  title2: 22,
  title1: 28,
  largeTitle: 34,
  display: 48,
} as const;

export const HEADER_TEXT_SCALE_LIMIT = 2;

export const STACKED_ROW_TEXT_SCALE = 1.5;

// 'Personalization' at 15 pt, in Bold Text, still fits a settings row on a 320 pt phone.
export const ROW_LABEL_TEXT_SCALE_LIMIT = 1.9;

export const codeFontChoices = {
  ios: [
    { id: 'default', label: 'Menlo', family: 'Menlo' },
    { id: 'courier', label: 'Courier New', family: 'Courier New' },
    { id: 'system-mono', label: 'System mono', family: 'ui-monospace' },
  ],
  default: [
    { id: 'default', label: 'Monospace', family: 'monospace' },
    { id: 'serif-monospace', label: 'Serif monospace', family: 'serif-monospace' },
  ],
} as const;

export const codeFontFaces = {
  ios: codeFontChoices.ios[0].family,
  default: codeFontChoices.default[0].family,
} as const;

export const transcriptSerifFaces = { ios: 'Georgia', default: 'serif' } as const;

export const zIndex = {
  base: 0,
  content: 1,
  control: 10,
  overlay: 200,
  modal: 300,
  notification: 400,
  fullscreen: 9999,
} as const;

export const motion = {
  instant: 90,
  quick: 160,
  moved: 260,
  reveal: 700,
  pulse: 1000,
  ambient: 2000,
  orbit: 3000,
} as const;

export const motionCurves = {
  standard: [0.2, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
  spring: [0.22, 1.2, 0.36, 1],
  reveal: [0.22, 1, 0.36, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const elevation = {
  e1: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  e2: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  e3: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 6,
  },
  e4: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 32,
    elevation: 12,
  },
} as const;

export const cardRadius = radii['2xl'];
export const sheetRadius = radii['3xl'];

export const notificationLedColors = agiMobileNotificationLedColors;
