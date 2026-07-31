import { useColorScheme } from 'react-native';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { getAccentSwatch, getColors, type ColorScheme } from './tokens';
import { useSystemHighContrast } from './useSystemHighContrast';
import type { StatusBarStyle } from 'expo-status-bar';

interface ThemeResult {
  colors: ColorScheme;
  isDark: boolean;
  isHighContrast: boolean;
  statusBarStyle: StatusBarStyle;
}

/**
 * Resolves the current theme based on the user's stored preference and
 * the system color scheme. Returns a `colors` palette, a boolean `isDark`
 * flag, and the appropriate status-bar style.
 *
 * Reads from the mode-specific settings store (local or cloud) based on the
 * current appMode, mirroring the projects.tsx dual-subscribe pattern.
 *
 * @example
 *   const { colors: themeColors, isDark, statusBarStyle } = useTheme();
 */
export function useTheme(): ThemeResult {
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isCloud = appMode === 'cloud';

  const localThemeMode = useLocalSettingsStore((s) => s.themeMode);
  const localAccentColor = useLocalSettingsStore((s) => s.accentColor);
  const cloudThemeMode = useCloudSettingsStore((s) => s.themeMode);
  const cloudAccentColor = useCloudSettingsStore((s) => s.accentColor);

  const themeMode = isCloud ? cloudThemeMode : localThemeMode;
  const accentColor = isCloud ? cloudAccentColor : localAccentColor;

  const rawScheme = useColorScheme();
  // Normalize: 'unspecified' (Android default) should fall back to dark
  const systemScheme: 'dark' | 'light' | null =
    rawScheme === 'light' ? 'light' : rawScheme === 'dark' ? 'dark' : null;
  const isHighContrast = useSystemHighContrast();
  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemScheme !== 'light');
  const resolved = getColors(themeMode, systemScheme, isHighContrast);
  const accent = isHighContrast ? null : resolveAccent(accentColor, isDark);
  return {
    colors: accent ? { ...resolved, teal: accent, terraCotta: accent } : resolved,
    isDark,
    isHighContrast,
    statusBarStyle: isDark ? 'light' : 'dark',
  };
}

function resolveAccent(color: string, isDark: boolean): string | null {
  if (color === 'neutral') return null;
  if (
    color === 'green' ||
    color === 'blue' ||
    color === 'violet' ||
    color === 'rose' ||
    color === 'amber'
  ) {
    return getAccentSwatch(color, isDark);
  }
  return null;
}

/** Convenience hook — returns just the resolved palette. */
export function useThemeColors(): ColorScheme {
  return useTheme().colors;
}
