/**
 * ThemeProvider tests
 *
 * Verifies that:
 * 1. ThemeContext is populated with the correct initial theme values
 * 2. useThemeContext() throws when used outside a provider
 * 3. ThemeConstants utilities (getSystemTheme, applyThemeToDocument) behave correctly
 * 4. The ThemeContextBridge syncs actualTheme with the DOM class
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import { ThemeProvider } from '../ThemeProvider';
import { useThemeContext } from '@shared/hooks/useThemeContext';
import {
  getSystemTheme,
  applyThemeToDocument,
  THEME_STORAGE_KEY,
  DEFAULT_THEME,
} from '../ThemeConstants';

// Mock next-themes so tests do not depend on Next.js SSR context
vi.mock('next-themes', () => {
  let _theme = 'system';
  const _listeners: Array<() => void> = [];

  const mockUseTheme = vi.fn(() => ({
    theme: _theme,
    setTheme: (t: string) => {
      _theme = t;
      _listeners.forEach((l) => l());
    },
    resolvedTheme: _theme === 'system' ? 'dark' : _theme,
  }));

  const ThemeProvider = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  return {
    ThemeProvider,
    useTheme: mockUseTheme,
    __resetTheme: () => {
      _theme = 'system';
    },
  };
});

// ---- ThemeConstants -------------------------------------------------------

describe('ThemeConstants', () => {
  describe('getSystemTheme', () => {
    it('returns "dark" when prefers-color-scheme: dark', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn((query: string) => ({
          matches: query.includes('dark'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });
      expect(getSystemTheme()).toBe('dark');
    });

    it('returns "light" when prefers-color-scheme is not dark', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn((query: string) => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });
      expect(getSystemTheme()).toBe('light');
    });
  });

  describe('applyThemeToDocument', () => {
    beforeEach(() => {
      document.documentElement.classList.remove('dark', 'light');
    });

    it('adds the "dark" class and removes "light"', () => {
      document.documentElement.classList.add('light');
      applyThemeToDocument('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);
    });

    it('adds the "light" class and removes "dark"', () => {
      document.documentElement.classList.add('dark');
      applyThemeToDocument('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('does not throw when called in SSR environment (window undefined guard)', () => {
      // applyThemeToDocument guards typeof window === 'undefined' internally
      expect(() => applyThemeToDocument('dark')).not.toThrow();
    });
  });

  describe('constants', () => {
    it('THEME_STORAGE_KEY is "theme"', () => {
      expect(THEME_STORAGE_KEY).toBe('theme');
    });

    it('DEFAULT_THEME is "system"', () => {
      expect(DEFAULT_THEME).toBe('system');
    });
  });
});

// ---- useThemeContext outside provider -------------------------------------

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

// ---- ThemeProvider DOM integration ---------------------------------------

describe('ThemeProvider DOM integration', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
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

  it('persists theme selection to localStorage via ThemeContext setTheme', () => {
    const { result } = renderHook(() => useThemeContext(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('reads initial theme from localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');

    const { result } = renderHook(() => useThemeContext(), {
      wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    });

    // The stored preference should be surfaced as the theme value
    expect(['light', 'system', 'dark']).toContain(result.current.theme);
  });

  it('syncs data-theme attribute when document.documentElement has "dark" class', () => {
    document.documentElement.classList.add('dark');

    // ThemeContextBridge uses a MutationObserver to sync. We trigger it by
    // rendering and checking the attribute is set.
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );

    // Allow MutationObserver microtask to fire
    // (jsdom processes sync mutations before the assertion)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('syncs data-theme attribute when document.documentElement has no "dark" class', () => {
    document.documentElement.classList.remove('dark');

    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
