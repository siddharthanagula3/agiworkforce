import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@shared/components/ThemeProvider';
import { useThemeContext } from '@shared/hooks/useThemeContext';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const originalMatchMedia = window.matchMedia;

interface SystemScheme {
  prefersDark: boolean;
  listeners: Set<(event: MediaQueryList) => void>;
}

const scheme: SystemScheme = { prefersDark: true, listeners: new Set() };

function installSystemScheme(prefersDark: boolean): void {
  scheme.prefersDark = prefersDark;
  scheme.listeners.clear();
  window.matchMedia = ((query: string) => {
    const list = {
      media: query,
      get matches() {
        return query === DARK_QUERY ? scheme.prefersDark : false;
      },
      onchange: null,
      addListener: (listener: (event: MediaQueryList) => void) => scheme.listeners.add(listener),
      removeListener: (listener: (event: MediaQueryList) => void) =>
        scheme.listeners.delete(listener),
      addEventListener: (_: string, listener: (event: MediaQueryList) => void) =>
        scheme.listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryList) => void) =>
        scheme.listeners.delete(listener),
      dispatchEvent: () => true,
    };
    return list as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

function changeSystemScheme(prefersDark: boolean): void {
  scheme.prefersDark = prefersDark;
  act(() => {
    for (const listener of [...scheme.listeners]) {
      listener(window.matchMedia(DARK_QUERY));
    }
  });
}

function Probe() {
  const { theme, actualTheme, setTheme } = useThemeContext();
  return (
    <div>
      <span data-testid="chosen">{theme}</span>
      <span data-testid="shown">{actualTheme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        Choose dark
      </button>
    </div>
  );
}

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().classList.remove('light', 'dark');
  root().removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

describe('the app follows the operating system theme while it is set to system', () => {
  it('repaints when the system scheme changes without a reload', () => {
    installSystemScheme(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('chosen').textContent).toBe('system');
    expect(screen.getByTestId('shown').textContent).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().getAttribute('data-theme')).toBe('dark');

    changeSystemScheme(false);
    expect(screen.getByTestId('shown').textContent).toBe('light');
    expect(root().classList.contains('light')).toBe(true);
    expect(root().classList.contains('dark')).toBe(false);
    expect(root().getAttribute('data-theme')).toBe('light');

    changeSystemScheme(true);
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('stops following the system once the user picks a theme of their own', () => {
    installSystemScheme(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(root().getAttribute('data-theme')).toBe('light');

    act(() => {
      screen.getByRole('button', { name: 'Choose dark' }).click();
    });
    expect(root().getAttribute('data-theme')).toBe('dark');

    changeSystemScheme(false);
    expect(screen.getByTestId('shown').textContent).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);
  });
});
