import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors, getColors, type ColorScheme } from './tokens';
import type { StatusBarStyle } from 'expo-status-bar';

interface ThemeResult {
  colors: ColorScheme;
  isDark: boolean;
  statusBarStyle: StatusBarStyle;
}

/**
 * Resolves the current theme based on the user's stored preference and
 * the system color scheme. Returns a `colors` palette, a boolean `isDark`
 * flag, and the appropriate status-bar style.
 *
 * @example
 *   const { colors: themeColors, isDark, statusBarStyle } = useTheme();
 */
export function useTheme(): ThemeResult {
  const themeMode = useSettingsStore((s) => s.themeMode);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const rawScheme = useColorScheme();
  // Normalize: 'unspecified' (Android default) should fall back to dark
  const systemScheme: 'dark' | 'light' | null =
    rawScheme === 'light' ? 'light' : rawScheme === 'dark' ? 'dark' : null;
  const resolved = getColors(themeMode, systemScheme);
  const isDark = resolved === colors;
  const accent = resolveAccent(accentColor, isDark);
  return {
    colors: accent ? { ...resolved, teal: accent, terraCotta: accent } : resolved,
    isDark,
    statusBarStyle: isDark ? 'light' : 'dark',
  };
}

function resolveAccent(color: string, isDark: boolean): string | null {
  if (color === 'neutral') return null;
  const palette: Record<string, { light: string; dark: string }> = {
    green: { light: '#0f8f6f', dark: '#10a37f' },
    blue: { light: '#2563eb', dark: '#60a5fa' },
    violet: { light: '#7c3aed', dark: '#a78bfa' },
    rose: { light: '#e11d48', dark: '#fb7185' },
    amber: { light: '#b45309', dark: '#fbbf24' },
  };
  const selected = palette[color];
  return selected ? (isDark ? selected.dark : selected.light) : null;
}

/** Convenience hook — returns just the resolved palette. */
export function useThemeColors(): ColorScheme {
  return useTheme().colors;
}
