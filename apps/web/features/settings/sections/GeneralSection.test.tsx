import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneralSection } from './GeneralSection';
import { ACCENT_COLORS } from '@shared/stores/web-settings-store';

const mocks = vi.hoisted(() => ({
  fetchPreferences: vi.fn(),
  setAccentColor: vi.fn(),
  setHighContrast: vi.fn(),
  setMotion: vi.fn(),
  settings: {
    accentColor: 'default' as string,
    highContrast: false,
    motion: 'system' as 'system' | 'reduced',
  },
  tts: {
    isSupported: false,
    voices: [] as Array<{ voiceURI: string; name: string; lang: string }>,
  },
}));

vi.mock('@shared/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      initialized: true,
      user: {
        email: 'demo@example.com',
        name: 'Demo User',
        profile: { display_name: 'Demo User', preferred_name: 'Demo' },
      },
    }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { fullName: 'Demo User', firstName: 'Demo' } }),
}));

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchStoredPreferenceNamespace: mocks.fetchPreferences,
  refreshProfileConsumers: vi.fn(),
  saveDisplayName: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedModelId: 'auto', setSelectedModel: vi.fn(), availableModels: [] }),
}));

vi.mock('@shared/stores/thinking-store', () => ({
  useThinkingStore: (selector: (state: unknown) => unknown) =>
    selector({ enabled: false, effort: 'medium', setEnabled: vi.fn(), setEffort: vi.fn() }),
}));

vi.mock('@shared/stores/web-settings-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/stores/web-settings-store')>();
  return {
    ACCENT_COLORS: actual.ACCENT_COLORS,
    useSettingsStore: (selector: (state: unknown) => unknown) =>
      selector({
        chatTextSize: 'default',
        setChatTextSize: vi.fn(),
        codeBlockWrap: false,
        setCodeBlockWrap: vi.fn(),
        motion: mocks.settings.motion,
        hiddenNavIds: [],
        setNavItemVisible: vi.fn(),
        setMotion: mocks.setMotion,
        accentColor: mocks.settings.accentColor,
        setAccentColor: mocks.setAccentColor,
        highContrast: mocks.settings.highContrast,
        setHighContrast: mocks.setHighContrast,
      }),
  };
});

vi.mock('@/lib/hooks/useTTS', () => ({
  useTTS: () => ({
    isSupported: mocks.tts.isSupported,
    voices: mocks.tts.voices,
    voiceUri: null,
    setVoiceUri: vi.fn(),
    speak: vi.fn(),
    stop: vi.fn(),
    isSpeaking: false,
  }),
}));

vi.mock('@/features/settings/components/LanguageSelector', () => ({
  LanguageSelector: () => null,
}));

vi.mock('@/features/settings/components/CustomCommandsSettings', () => ({
  CustomCommandsSettings: () => null,
}));

vi.mock('@/features/chat/components/dialogs/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('GeneralSection preference hydration', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
    mocks.setAccentColor.mockReset();
    mocks.setHighContrast.mockReset();
    mocks.settings.accentColor = 'default';
    mocks.settings.highContrast = false;
    mocks.settings.motion = 'system';
    mocks.setMotion.mockReset();
    mocks.setMotion.mockImplementation((value: 'system' | 'reduced') => {
      mocks.settings.motion = value;
    });
    mocks.tts.isSupported = false;
    mocks.tts.voices = [];
  });

  it('exposes the selected theme to assistive technology', () => {
    render(<GeneralSection />);

    expect(screen.getByRole('group', { name: 'Theme' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('offers the Motion preference beside the other appearance controls', async () => {
    render(<GeneralSection />);

    const group = screen.getByRole('group', { name: 'Motion' });
    expect(group).toBeVisible();
    expect(screen.getByRole('button', { name: 'System motion' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reduced motion' }));

    expect(mocks.setMotion).toHaveBeenCalledWith('reduced');
  });

  it('uses mobile-safe stacked rows for profile controls', () => {
    render(<GeneralSection />);

    const fullName = screen.getByRole('textbox', { name: 'Full name' });
    expect(fullName).toHaveClass('w-full');
    expect(fullName.parentElement).toHaveClass('w-full', 'min-w-0');
    expect(fullName.parentElement?.parentElement).toHaveClass('flex-col', 'sm:flex-row');
  });

  it('blocks edits until stored custom instructions have loaded', async () => {
    const pending = deferred<{ instructions: string }>();
    mocks.fetchPreferences.mockReturnValueOnce(pending.promise);

    render(<GeneralSection />);

    const instructions = screen.getByRole('textbox', { name: /Instructions for AGI/ });
    expect(instructions).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Loading profile');

    await act(async () => {
      pending.resolve({ instructions: 'Keep answers concise.' });
      await pending.promise;
    });

    expect(instructions).toBeEnabled();
    expect(instructions).toHaveValue('Keep answers concise.');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps fields disabled after a load failure and offers an explicit retry', async () => {
    mocks.fetchPreferences.mockRejectedValueOnce(new Error('Settings unavailable'));

    render(<GeneralSection />);

    expect(await screen.findByText('Settings unavailable')).toBeVisible();
    expect(screen.getByRole('textbox', { name: /Instructions for AGI/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});

describe('GeneralSection appearance controls', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
    mocks.setAccentColor.mockReset();
    mocks.setHighContrast.mockReset();
    mocks.settings.accentColor = 'default';
    mocks.settings.highContrast = false;
  });

  it('offers every registered accent and marks the active one', () => {
    render(<GeneralSection />);

    const group = screen.getByRole('group', { name: 'Accent colour' });
    expect(group).toBeVisible();
    for (const accent of ACCENT_COLORS) {
      expect(screen.getByRole('button', { name: `${accent.label} accent` })).toBeVisible();
    }
    expect(screen.getByRole('button', { name: 'AGI amber accent' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Violet accent' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('writes the chosen accent back to the store the stylesheet reads', async () => {
    render(<GeneralSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Violet accent' }));

    expect(mocks.setAccentColor).toHaveBeenCalledWith('violet');
  });

  it('carries the swatch attribute the stylesheet paints each colour from', () => {
    render(<GeneralSection />);

    expect(screen.getByRole('button', { name: 'Rose accent' })).toHaveAttribute(
      'data-accent-swatch',
      'rose',
    );
  });

  it('exposes a high contrast switch that reports and flips its state', async () => {
    render(<GeneralSection />);

    const contrast = screen.getByRole('switch', { name: 'High contrast' });
    expect(contrast).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(contrast);

    expect(mocks.setHighContrast).toHaveBeenCalledWith(true);
  });
});

describe('GeneralSection read-aloud disclosure', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
    mocks.tts.isSupported = true;
    mocks.tts.voices = [{ voiceURI: 'voice-a', name: 'Voice A', lang: 'en-US' }];
  });

  it('says where the audio goes instead of offering an output picker it cannot honour', () => {
    render(<GeneralSection />);

    expect(screen.getByRole('combobox', { name: 'Read-aloud voice' })).toBeVisible();
    expect(screen.getByText(/system default output device/i)).toBeVisible();
    expect(screen.getByText(/browsers give web pages no way to choose one/i)).toBeVisible();
  });

  it('states plainly that there is no continuous voice conversation', () => {
    render(<GeneralSection />);

    expect(screen.getByText(/no hands-free voice conversation that listens back/i)).toBeVisible();
  });

  it('states how far display-language translation actually reaches', () => {
    render(<GeneralSection />);

    expect(screen.getByText(/chat interface is still English/i)).toBeVisible();
  });

  it('explains the absence rather than hiding the row when no voices exist', () => {
    mocks.tts.isSupported = false;
    mocks.tts.voices = [];

    render(<GeneralSection />);

    expect(screen.getByText(/exposes no speech voices/i)).toBeVisible();
  });
});
