import React, { useCallback, useEffect } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';
import { type Theme, THEME_STORAGE_KEY, DEFAULT_THEME } from './ThemeConstants';
import { ThemeContext } from './ThemeContext';

const NoncedNextThemesProvider = NextThemesProvider as React.ComponentType<
  React.ComponentProps<typeof NextThemesProvider> & { nonce?: string }
>;

/**
 * Inner context bridge: delegates directly to next-themes (which owns the
 * <html class> and localStorage persistence) and re-exposes its state through
 * ThemeContext so all existing useThemeContext() consumers keep working.
 */
function ThemeContextBridge({ children }: { children: React.ReactNode }) {
  const { theme: nextTheme, resolvedTheme, setTheme: setNextTheme } = useNextTheme();

  const theme = (nextTheme as Theme | undefined) ?? DEFAULT_THEME;
  const actualTheme: 'light' | 'dark' = resolvedTheme === 'light' ? 'light' : 'dark';

  // Mirror the resolved theme onto data-theme for any CSS selectors that use it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', actualTheme);
  }, [actualTheme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      // next-themes applies the <html> class + persists to THEME_STORAGE_KEY.
      setNextTheme(newTheme);
    },
    [setNextTheme],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, actualTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * ThemeProvider wraps the app with next-themes' ThemeProvider for SSR-safe
 * theme injection (no flash on initial load) and exposes the theme state
 * through ThemeContext for backwards compatibility with useThemeContext().
 *
 * Supported themes: 'light' | 'dark' | 'system'
 * Default: 'system' (follows OS preference)
 * Storage key: THEME_STORAGE_KEY ('theme')
 */
export function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NoncedNextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      storageKey={THEME_STORAGE_KEY}
      enableSystem
      disableTransitionOnChange={false}
      nonce={nonce}
    >
      <ThemeContextBridge>{children}</ThemeContextBridge>
    </NoncedNextThemesProvider>
  );
}
