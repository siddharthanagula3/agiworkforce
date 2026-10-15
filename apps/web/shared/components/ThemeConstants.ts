export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'theme';

export const DEFAULT_THEME: Theme = 'system';

export const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

export const INVALID_THEME_FALLBACK: Theme = 'dark';

export function normalizeTheme(value: string | null | undefined): Theme {
  if (value == null) return DEFAULT_THEME;
  return THEMES.find((theme) => theme === value) ?? INVALID_THEME_FALLBACK;
}
