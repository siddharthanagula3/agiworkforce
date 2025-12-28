import { useCallback } from 'react';
import { useThemeContext } from '../providers/ThemeProvider';

/**
 * DEPRECATED: Use useThemeContext() instead
 * This hook now delegates to useThemeContext for backward compatibility
 * but should be replaced with useThemeContext in new code
 */
export function useTheme() {
  console.warn('[useTheme] This hook is deprecated. Use useThemeContext() instead.');

  const { theme, setTheme } = useThemeContext();

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [theme, setTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}
