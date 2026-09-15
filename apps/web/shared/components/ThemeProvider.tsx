import React, { useCallback, useEffect, useRef } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';
import { type Theme, THEME_STORAGE_KEY, DEFAULT_THEME } from './ThemeConstants';
import { ThemeContext } from './ThemeContext';

const NoncedNextThemesProvider = NextThemesProvider as React.ComponentType<
  React.ComponentProps<typeof NextThemesProvider> & { nonce?: string }
>;

function ThemeContextBridge({ children }: { children: React.ReactNode }) {
  const { theme: nextTheme, resolvedTheme, setTheme: setNextTheme } = useNextTheme();

  const theme = (nextTheme as Theme | undefined) ?? DEFAULT_THEME;
  const actualTheme: 'light' | 'dark' = resolvedTheme === 'light' ? 'light' : 'dark';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', actualTheme);
  }, [actualTheme]);

  const applyTheme = useRef(setNextTheme);
  applyTheme.current = setNextTheme;
  const setTheme = useCallback((newTheme: Theme) => {
    applyTheme.current(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, actualTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

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
