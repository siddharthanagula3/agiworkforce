import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from '@shared/stores/web-settings-store';

const session = { isLoaded: true, isSignedIn: true };
const themeState = { theme: 'system', setTheme: vi.fn() };
const preferences = {
  fetchStoredPreferenceNamespace: vi.fn(async (namespace: string) =>
    namespace === 'appearance'
      ? {
          theme: 'system',
          accentColor: 'amber',
          font: 'default',
          textSize: 'default',
          motion: 'system',
          highContrast: false,
          codeBlockWrap: false,
          dictationEnabled: true,
          voiceSpeed: 'normal',
          hiddenNavIds: [],
        }
      : { locale: 'en' },
  ),
  savePreferenceNamespace: vi.fn(
    async (_namespace: string, _patch: unknown, _options: unknown) => ({ version: null }),
  ),
};

vi.mock('@/lib/identity/client', () => ({
  useSession: () => session,
}));

vi.mock('@shared/hooks/useAppTheme', () => ({
  useAppTheme: () => themeState,
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

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'test-csrf-token'),
}));

const { CloudSettingsSync } = await import('@/features/settings/components/CloudSettingsSync');

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  session.isLoaded = true;
  session.isSignedIn = true;
  preferences.fetchStoredPreferenceNamespace.mockClear();
  preferences.savePreferenceNamespace.mockClear();
  preferences.savePreferenceNamespace.mockResolvedValue({ version: null });
  useSettingsStore.setState({
    accentColor: 'default',
    chatFont: 'default',
    chatTextSize: 'default',
    motion: 'system',
    highContrast: false,
    codeBlockWrap: false,
    dictationEnabled: true,
    voiceSpeed: 'normal',
    hiddenNavIds: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('a pending appearance write and a page unload', () => {
  it('is sent immediately on pagehide, without waiting for the debounce', async () => {
    render(<CloudSettingsSync />);
    await settle();

    act(() => {
      useSettingsStore.getState().setAccentColor('blue');
    });
    await settle();

    expect(preferences.savePreferenceNamespace).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(preferences.savePreferenceNamespace).toHaveBeenCalledWith(
      'appearance',
      { accentColor: 'blue' },
      { merge: true, keepalive: true },
    );
  });

  it('does nothing on pagehide when nothing changed', async () => {
    render(<CloudSettingsSync />);
    await settle();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(preferences.savePreferenceNamespace).not.toHaveBeenCalled();
  });

  it('does not double-send once the debounce itself has already fired', async () => {
    render(<CloudSettingsSync />);
    await settle();

    act(() => {
      useSettingsStore.getState().setChatTextSize('large');
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(preferences.savePreferenceNamespace).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(preferences.savePreferenceNamespace).toHaveBeenCalledTimes(1);
  });
});
