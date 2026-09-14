import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from '@shared/stores/web-settings-store';

const session = { isLoaded: true, isSignedIn: false };
const themeState = {
  theme: 'system',
  setTheme: vi.fn((next: string) => {
    themeState.theme = next;
  }),
};
const language = { code: 'en', changeLanguage: vi.fn(async (_code: string) => undefined) };

const preferences = {
  fetchStoredPreferenceNamespace: vi.fn(
    async (_namespace: string) => ({}) as Record<string, unknown>,
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

const i18nInstance = {
  get language() {
    return language.code;
  },
  changeLanguage: async (code: string) => language.changeLanguage(code),
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: i18nInstance }),
}));

vi.mock('@/app/i18n/index', () => ({
  SUPPORTED_LANGUAGES: [{ code: 'en' }, { code: 'fr' }, { code: 'es' }],
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchStoredPreferenceNamespace: (namespace: string) =>
    preferences.fetchStoredPreferenceNamespace(namespace),
  savePreferenceNamespace: (namespace: string, patch: unknown, options: unknown) =>
    preferences.savePreferenceNamespace(namespace, patch, options),
}));

const { CloudSettingsSync } = await import('@/features/settings/components/CloudSettingsSync');

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  session.isLoaded = true;
  session.isSignedIn = false;
  themeState.theme = 'system';
  language.code = 'en';
  preferences.fetchStoredPreferenceNamespace.mockResolvedValue({});
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

describe('a signed-out visitor', () => {
  it('never reads or writes the account settings', async () => {
    render(<CloudSettingsSync />);
    await settle();

    act(() => {
      useSettingsStore.getState().setAccentColor('rose');
    });
    await flushDebounce();

    expect(preferences.fetchStoredPreferenceNamespace).not.toHaveBeenCalled();
    expect(preferences.savePreferenceNamespace).not.toHaveBeenCalled();
  });
});

describe('signing in', () => {
  it('takes the account values and does not write them straight back', async () => {
    session.isSignedIn = true;
    preferences.fetchStoredPreferenceNamespace.mockImplementation(async (namespace: string) =>
      namespace === 'appearance'
        ? {
            theme: 'dark',
            accentColor: 'violet',
            font: 'system',
            textSize: 'large',
            motion: 'reduced',
            highContrast: true,
            codeBlockWrap: true,
            dictationEnabled: false,
            voiceSpeed: 'fast',
            hiddenNavIds: ['projects'],
          }
        : { locale: 'en' },
    );

    render(<CloudSettingsSync />);
    await settle();
    await flushDebounce();

    const state = useSettingsStore.getState();
    expect(state.accentColor).toBe('violet');
    expect(state.chatFont).toBe('sans');
    expect(state.chatTextSize).toBe('large');
    expect(state.hiddenNavIds).toEqual(['projects']);
    expect(themeState.setTheme).toHaveBeenCalledWith('dark');
    expect(preferences.savePreferenceNamespace).not.toHaveBeenCalled();
  });

  it('adopts the language the account holds', async () => {
    session.isSignedIn = true;
    preferences.fetchStoredPreferenceNamespace.mockImplementation(async (namespace: string) =>
      namespace === 'appearance' ? {} : { locale: 'fr' },
    );

    render(<CloudSettingsSync />);
    await settle();

    expect(language.changeLanguage).toHaveBeenCalledWith('fr');
  });

  it('leaves the language alone when the account already agrees with this device', async () => {
    session.isSignedIn = true;
    language.code = 'es';
    preferences.fetchStoredPreferenceNamespace.mockImplementation(async (namespace: string) =>
      namespace === 'appearance' ? {} : { locale: 'es' },
    );

    render(<CloudSettingsSync />);
    await settle();
    await flushDebounce();

    expect(language.changeLanguage).not.toHaveBeenCalled();
    expect(preferences.savePreferenceNamespace).not.toHaveBeenCalledWith(
      'language',
      expect.anything(),
      expect.anything(),
    );
  });

  it('sends a language the user picks here to the account', async () => {
    session.isSignedIn = true;
    preferences.fetchStoredPreferenceNamespace.mockImplementation(async (namespace: string) =>
      namespace === 'appearance' ? {} : { locale: 'en' },
    );

    const view = render(<CloudSettingsSync />);
    await settle();

    language.code = 'es';
    view.rerender(<CloudSettingsSync />);
    await settle();

    expect(preferences.savePreferenceNamespace).toHaveBeenCalledWith(
      'language',
      { locale: 'es' },
      { merge: true },
    );
  });

  it('writes nothing at all when the account could not be read', async () => {
    session.isSignedIn = true;
    preferences.fetchStoredPreferenceNamespace.mockRejectedValue(new Error('offline'));

    render(<CloudSettingsSync />);
    await settle();

    act(() => {
      useSettingsStore.getState().setChatTextSize('small');
    });
    await flushDebounce();

    expect(preferences.savePreferenceNamespace).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().chatTextSize).toBe('small');
  });
});

describe('changing a control on web', () => {
  it('sends only the key that changed, under the shared name', async () => {
    session.isSignedIn = true;
    preferences.fetchStoredPreferenceNamespace.mockImplementation(async (namespace: string) =>
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
    );

    render(<CloudSettingsSync />);
    await settle();

    act(() => {
      useSettingsStore.getState().setAccentColor('blue');
    });
    await flushDebounce();

    expect(preferences.savePreferenceNamespace).toHaveBeenCalledWith(
      'appearance',
      { accentColor: 'blue' },
      { merge: true },
    );
  });

  it('keeps the local value and offers a retry when the save fails', async () => {
    session.isSignedIn = true;
    preferences.fetchStoredPreferenceNamespace.mockImplementation(async (namespace: string) =>
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
    );
    preferences.savePreferenceNamespace.mockRejectedValue(new Error('nope'));

    const { useCloudSettingsSyncStatus } =
      await import('@/features/settings/lib/cloud-settings-sync-status');

    render(<CloudSettingsSync />);
    await settle();

    act(() => {
      useSettingsStore.getState().setChatTextSize('small');
    });
    await flushDebounce();

    expect(useSettingsStore.getState().chatTextSize).toBe('small');

    let status = renderStatus(useCloudSettingsSyncStatus);
    expect(status.error).not.toBeNull();
    expect(status.retry).toBeTypeOf('function');

    preferences.savePreferenceNamespace.mockResolvedValue({ version: null });
    await act(async () => {
      status.retry?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    status = renderStatus(useCloudSettingsSyncStatus);
    expect(status.error).toBeNull();
    expect(preferences.savePreferenceNamespace).toHaveBeenLastCalledWith(
      'appearance',
      { textSize: 'small' },
      { merge: true },
    );
  });
});

function renderStatus(hook: () => { error: string | null; retry: (() => void) | null }) {
  let captured: { error: string | null; retry: (() => void) | null } = {
    error: null,
    retry: null,
  };
  function Probe() {
    captured = hook();
    return null;
  }
  render(<Probe />);
  return captured;
}
