import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@shared/components/ThemeProvider';
import { useAppTheme } from '@shared/hooks/useAppTheme';

const session = { isLoaded: true, isSignedIn: true };
const preferences = {
  fetchStoredPreferenceNamespace: vi.fn(async (namespace: string) =>
    namespace === 'appearance' ? { theme: 'light' } : { locale: 'en' },
  ),
  savePreferenceNamespace: vi.fn(
    async (_namespace: string, _patch: unknown, _options: unknown) => ({ version: null }),
  ),
};

vi.mock('@/lib/identity/client', () => ({
  useSession: () => session,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en', changeLanguage: async (_code: string) => undefined },
  }),
}));

vi.mock('@/app/i18n/index', () => ({
  SUPPORTED_LANGUAGES: [{ code: 'en' }],
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchStoredPreferenceNamespace: (namespace: string) =>
    preferences.fetchStoredPreferenceNamespace(namespace),
  savePreferenceNamespace: (namespace: string, patch: unknown, options: unknown) =>
    preferences.savePreferenceNamespace(namespace, patch, options),
}));

const { CloudSettingsSync } = await import('@/features/settings/components/CloudSettingsSync');

const setters: Array<(theme: string) => void> = [];

function ThemeProbe() {
  const { theme, setTheme } = useAppTheme();
  setters.push(setTheme);
  return (
    <button type="button" onClick={() => setTheme('dark')}>
      {theme}
    </button>
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setters.length = 0;
  window.localStorage.clear();
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        media: '',
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('changing the theme after the account settings hydrated', () => {
  it('keeps the new theme instead of reading the account value back over it, then saves it', async () => {
    render(
      <ThemeProvider>
        <CloudSettingsSync />
        <ThemeProbe />
      </ThemeProvider>,
    );
    await settle();
    expect(screen.getByRole('button')).toHaveTextContent('light');
    const appearanceReads = () =>
      preferences.fetchStoredPreferenceNamespace.mock.calls.filter(
        ([namespace]) => namespace === 'appearance',
      ).length;
    expect(appearanceReads()).toBe(1);

    fireEvent.click(screen.getByRole('button'));
    await settle();

    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(appearanceReads()).toBe(1);
    expect(new Set(setters).size).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('button')).toHaveTextContent('dark');
    const appearanceWrites = preferences.savePreferenceNamespace.mock.calls.filter(
      ([namespace]) => namespace === 'appearance',
    );
    expect(appearanceWrites).toHaveLength(1);
    expect(appearanceWrites[0]?.[1]).toMatchObject({ theme: 'dark' });
  });
});
