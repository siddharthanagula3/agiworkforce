import { agiNativeColors } from '@agiworkforce/design-tokens';

export const colors = agiNativeColors.dark;
export const lightColors = agiNativeColors.light;

export type ColorScheme = {
  [K in keyof typeof agiNativeColors.dark]: string;
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
