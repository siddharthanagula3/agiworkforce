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
          '--agi-fg': colors.textPrimary,
        }),
      ]}
    >
      {children}
    </View>
  );
}
