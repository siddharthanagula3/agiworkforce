import React, { useEffect, useState } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type Theme, THEME_STORAGE_KEY, DEFAULT_THEME, getSystemTheme } from './ThemeConstants';
import { ThemeContext } from './ThemeContext';

/**
 * Inner context bridge: reads the resolved theme from next-themes via
 * window.document.documentElement and re-exposes it through ThemeContext.
 * This keeps all existing consumers of useThemeContext() working unchanged.
 */
function ThemeContextBridge({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || DEFAULT_THEME;
  });

  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return document.documentElement.classList.contains('dark') ? 'dark' : getSystemTheme();
  });

  // Sync actualTheme with the class applied by next-themes to <html>
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const resolved = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      setActualTheme(resolved);
      // Keep data-theme attribute in sync for any CSS selectors that use it
      document.documentElement.setAttribute('data-theme', resolved);
    });
    observer.observe(document.documentElement, { attributeFilter: ['class'] });

    // Run once immediately to sync initial state
    const initial = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setActualTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);

    return () => observer.disconnect();
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    // Delegate actual DOM mutation to next-themes via a CustomEvent so the
    // NextThemesProvider picks it up on the next render cycle.  In practice
    // consumers should call next-themes' useTheme().setTheme() directly when
    // they need to switch themes; this shim keeps the legacy API functional.
    window.dispatchEvent(new CustomEvent('agi:set-theme', { detail: newTheme }));
  };

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
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      storageKey={THEME_STORAGE_KEY}
      enableSystem
      disableTransitionOnChange={false}
    >
      <ThemeContextBridge>{children}</ThemeContextBridge>
    </NextThemesProvider>
  );
}
