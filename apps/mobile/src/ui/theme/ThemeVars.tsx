/**
 * Publishes the resolved theme to NativeWind as CSS variables.
 *
 * Tailwind colours compile to constants, so every `bg-surface-base` and
 * `text-white/60` in the app was pinned to the dark palette regardless of the
 * user's theme. Screens styled with classes rendered dark inside an otherwise
 * light app (Companion, Compare, Schedules), and screens styled with
 * `useThemeColors()` followed the theme — the two could not agree.
 *
 * Wrapping the tree in this provider makes the class-based half read the same
 * tokens as the hook-based half. Adding a token here is the only step needed to
 * expose it to classNames; see tailwind.config.js for the matching `var()`
 * references.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';

import { useThemeColors } from './useTheme';

export function ThemeVars({ children }: { children: ReactNode }) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        { flex: 1 },
        vars({
          '--agi-surface-base': colors.surfaceBase,
          '--agi-surface-elevated': colors.surfaceElevated,
          '--agi-surface-overlay': colors.surfaceOverlay,
          '--agi-surface-hover': colors.surfaceHover,
          // The readable colour on the current surface. `text-white/60` and
          // friends are opacity ramps over this, not over the colour white.
          '--agi-fg': colors.textPrimary,
        }),
      ]}
    >
      {children}
    </View>
  );
}
