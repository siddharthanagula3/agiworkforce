'use client';

import { useCallback, type SetStateAction } from 'react';
import { useThemeContext } from './useThemeContext';
import type { Theme } from '@shared/components/ThemeConstants';

export function useAppTheme() {
  const { theme, setTheme, actualTheme } = useThemeContext();

  const setNextTheme = useCallback(
    (nextTheme: SetStateAction<string>) => {
      const resolved = typeof nextTheme === 'function' ? nextTheme(theme) : nextTheme;
      if (resolved === 'light' || resolved === 'dark' || resolved === 'system') {
        setTheme(resolved);
      }
    },
    [setTheme, theme],
  );

  return {
    theme,
    setTheme: setNextTheme,
    resolvedTheme: actualTheme,
    systemTheme: actualTheme,
    themes: ['light', 'dark', 'system'] satisfies Theme[],
  };
}
