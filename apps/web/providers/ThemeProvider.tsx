'use client';

/**
 * ThemeProvider — re-exports the shared ThemeProvider implementation.
 * Kept as a separate file for backwards-compat with any direct imports of this path.
 */
export { ThemeProvider } from '@shared/components/ThemeProvider';
export { useThemeContext } from '@shared/hooks/useThemeContext';
