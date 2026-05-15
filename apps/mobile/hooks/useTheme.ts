import { useColorScheme } from 'react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors, getColors, type ColorScheme } from '@/lib/theme';
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
  const rawScheme = useColorScheme();
  // Normalize: 'unspecified' (Android default) should fall back to dark
  const systemScheme: 'dark' | 'light' | null =
    rawScheme === 'light' ? 'light' : rawScheme === 'dark' ? 'dark' : null;
  const resolved = getColors(themeMode, systemScheme);
  const isDark = resolved === colors;
  return {
    colors: resolved,
    isDark,
    statusBarStyle: isDark ? 'light' : 'dark',
  };
}

/** Convenience hook — returns just the resolved palette. */
export function useThemeColors(): ColorScheme {
  return useTheme().colors;
}
