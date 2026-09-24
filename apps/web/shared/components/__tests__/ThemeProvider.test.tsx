/**
 * ThemeProvider tests
 *
 * Verifies that:
 * 1. ThemeContext is populated with the correct initial theme values
 * 2. useThemeContext() throws when used outside a provider
 * 3. The shared theme constants remain stable
 * 4. The ThemeContextBridge syncs actualTheme with the DOM class
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import { ThemeProvider } from '../ThemeProvider';
import { useThemeContext } from '@shared/hooks/useThemeContext';
import { THEME_STORAGE_KEY, DEFAULT_THEME } from '../ThemeConstants';

const mockSetTheme = vi.fn();
let mockTheme = 'system';
vi.mock('next-themes', () => {
  const ThemeProvider = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    ThemeProvider,
    useTheme: () => ({
      theme: mockTheme,
      setTheme: mockSetTheme,
      resolvedTheme: mockTheme === 'system' ? 'dark' : mockTheme,
    }),
  };
});

describe('ThemeConstants', () => {
  describe('constants', () => {
    it('THEME_STORAGE_KEY is "theme"', () => {
      expect(THEME_STORAGE_KEY).toBe('theme');
    });

    it('DEFAULT_THEME is "system"', () => {
      expect(DEFAULT_THEME).toBe('system');
    });
  });
});

describe('useThemeContext', () => {
  it('throws when used outside ThemeProvider', () => {
    expect(() => renderHook(() => useThemeContext())).toThrow(
      'useThemeContext must be used within a ThemeProvider',
    );
  });

  it('provides theme, setTheme, and actualTheme when inside ThemeProvider', () => {
    const { result } = renderHook(() => useThemeContext(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });
    expect(result.current.theme).toBeDefined();
    expect(typeof result.current.setTheme).toBe('function');
    expect(['light', 'dark']).toContain(result.current.actualTheme);
  });
});

describe('ThemeProvider DOM integration', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
    mockSetTheme.mockClear();
    mockTheme = 'system';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders children without crashing', () => {
    const { getByText } = render(
      <ThemeProvider>
        <span>hello</span>
      </ThemeProvider>,
    );
    expect(getByText('hello')).toBeTruthy();
  });

  it('delegates theme changes to next-themes (which owns <html> class + storage)', () => {
    const { result } = renderHook(() => useThemeContext(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('surfaces the theme selected in next-themes', () => {
    mockTheme = 'light';

    const { result } = renderHook(() => useThemeContext(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.actualTheme).toBe('light');
  });

  it('mirrors data-theme from the resolved next-themes theme (dark)', () => {
    mockTheme = 'system';

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('mirrors data-theme from the resolved next-themes theme (light)', () => {
    mockTheme = 'light';

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
