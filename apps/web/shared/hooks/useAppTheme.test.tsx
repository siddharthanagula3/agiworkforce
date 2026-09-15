import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ThemeContext, type ThemeContextType } from '@shared/components/ThemeContext';
import { useAppTheme } from '@shared/hooks/useAppTheme';

describe('useAppTheme', () => {
  it('keeps one setTheme identity while the theme changes and still resolves functional updates from the latest theme', () => {
    const setTheme = vi.fn();
    let value: ThemeContextType = { theme: 'light', setTheme, actualTheme: 'light' };
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );

    const { result, rerender } = renderHook(() => useAppTheme(), { wrapper: Wrapper });
    const initialSetter = result.current.setTheme;

    value = { theme: 'dark', setTheme, actualTheme: 'dark' };
    rerender();

    expect(result.current.theme).toBe('dark');
    expect(result.current.setTheme).toBe(initialSetter);

    initialSetter((previous) => (previous === 'dark' ? 'light' : 'dark'));
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('ignores a value that is not a theme', () => {
    const setTheme = vi.fn();
    const value: ThemeContextType = { theme: 'system', setTheme, actualTheme: 'light' };
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
    const { result } = renderHook(() => useAppTheme(), { wrapper: Wrapper });

    result.current.setTheme('sepia');

    expect(setTheme).not.toHaveBeenCalled();
  });
});
