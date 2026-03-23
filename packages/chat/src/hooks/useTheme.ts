import { useEffect, useCallback, useMemo } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { ThemeMode } from '../lib/tokens';

// Sentinel attribute: host apps that manage their own theme set
// data-theme-managed on <html> to suppress the chat package's theme logic.
const HOST_MANAGED_ATTR = 'data-theme-managed';

export function useTheme() {
  const themeMode = useUIStore((s) => s.themeMode);
  const setThemeMode = useUIStore((s) => s.setThemeMode);

  useEffect(() => {
    // Bail out early if the host app owns theme management
    if (document.documentElement.hasAttribute(HOST_MANAGED_ATTR)) {
      return undefined;
    }

    const root = document.documentElement;
    const applyTheme = (mode: ThemeMode) => {
      const resolved =
        mode === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : mode;
      root.classList.toggle('dark', resolved === 'dark');
      root.setAttribute('data-theme', resolved === 'dark' ? 'dusk' : 'dawn');
    };

    applyTheme(themeMode);

    if (themeMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }

    return undefined;
  }, [themeMode]);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode =
      themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark';
    setThemeMode(next);
  }, [themeMode, setThemeMode]);

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return useMemo(
    () => ({ themeMode, setThemeMode, toggleTheme, isDark }),
    [themeMode, setThemeMode, toggleTheme, isDark],
  );
}
