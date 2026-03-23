import { useEffect } from 'react';

/**
 * Manages theme class on document.documentElement.
 * When data-theme-managed is set, the host app handles theming and this hook is a no-op.
 */
export function useTheme() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // If host app manages theme, do nothing
    if (document.documentElement.hasAttribute('data-theme-managed')) return;

    // Default to dark theme
    document.documentElement.classList.add('dark');
  }, []);
}
