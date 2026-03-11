import { createContext, useContext, useEffect, useState } from 'react';

import { applyTheme, clearAppliedTheme, getThemeById } from '../themes';

/** Base modes. Any other string is interpreted as a named theme ID. */
type BaseTheme = 'dark' | 'light' | 'system';
type Theme = BaseTheme | string;

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );

  useEffect(() => {
    const root = window.document.documentElement;

    // Named theme: delegate to the theme registry
    if (theme !== 'dark' && theme !== 'light' && theme !== 'system') {
      const themeDefinition = getThemeById(theme);
      if (themeDefinition) {
        applyTheme(themeDefinition);
        return;
      }
      // Unknown ID — fall through to default dark
    }

    // Base mode: clear any previously applied inline theme properties
    clearAppliedTheme();
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme as BaseTheme);
  }, [theme]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setThemeState(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useThemeContext = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error('useThemeContext must be used within a ThemeProvider');

  return context;
};
