import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { savePreferenceNamespace } from '@/app/settings/_lib/preferences-client';
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

  it('requires successful personalization hydration before edits and recovers on retry', async () => {
    mocks.fetchPreferences.mockImplementation(async (namespace: string) => {
      if (namespace === 'personalization') throw new Error('Response preferences unavailable');
      return { instructions: 'Keep my saved instructions.' };
    });
    render(<GeneralSection />);
    expect(await screen.findByText('Response preferences unavailable')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Response style' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /Instructions for AGI/ })).toBeDisabled();
    mocks.fetchPreferences.mockImplementation(async (namespace: string) =>
      namespace === 'personalization'
        ? { style: 'formal' }
        : { instructions: 'Keep my saved instructions.' },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Response style' })).toBeEnabled(),
    );
    expect(screen.getByRole('combobox', { name: 'Response style' })).toHaveValue('formal');
    expect(screen.getByRole('textbox', { name: /Instructions for AGI/ })).toHaveValue(
      'Keep my saved instructions.',
    );
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

  it('describes read-aloud without denying the separate voice mode', () => {
    render(<GeneralSection />);

    expect(screen.getByText(/Read-aloud plays a reply on request and then stops/i)).toBeVisible();
    expect(screen.queryByText(/no hands-free voice conversation/i)).toBeNull();
  });

  it('states how far display-language translation actually reaches', () => {
    render(<GeneralSection />);

    expect(
      screen.getByText(/Settings field labels and your conversations are unaffected/i),
    ).toBeVisible();
  });

  it('explains the absence rather than hiding the row when no voices exist', () => {
    mocks.tts.isSupported = false;
    mocks.tts.voices = [];

    render(<GeneralSection />);

    expect(screen.getByText(/exposes no speech voices/i)).toBeVisible();
  });
});

describe('GeneralSection row density', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
  });

  it('renders the four characteristics as label-left selects, not sliders', () => {
    render(<GeneralSection />);

    for (const label of ['Warmth', 'Enthusiasm', 'Headers and lists', 'Emoji']) {
      const select = screen.getByRole('combobox', { name: label });
      expect(select).toHaveValue('default');
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Less', 'Default', 'More']);
    }
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('writes the chosen level back to the personalization state', async () => {
    render(<GeneralSection />);

    const select = screen.getByRole('combobox', { name: 'Warmth' });
    await waitFor(() => expect(select).toBeEnabled());
    await userEvent.selectOptions(select, 'more');

    expect(select).toHaveValue('more');
  });

  it('renders chat font as a select rather than a button group', () => {
    render(<GeneralSection />);

    const select = screen.getByRole('combobox', { name: 'Chat font' });
    expect(select).toHaveValue('default');
    expect(screen.queryByRole('button', { name: /chat font$/i })).toBeNull();
  });

  it('shows no loading text once preferences have resolved', async () => {
    render(<GeneralSection />);

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByText(/loading/i)).toBeNull();
  });

  it('renders no prose card around the profile form', async () => {
    render(<GeneralSection />);

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(document.querySelector('[class*="rounded-xl border"]')).toBeNull();
  });
});

describe('GeneralSection instruction and response-style preferences', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
    mocks.settings.accentColor = 'default';
    mocks.settings.highContrast = false;
    mocks.settings.motion = 'system';
    mocks.tts.isSupported = false;
    mocks.tts.voices = [];
  });

  it('offers a technical level, a preferred formatting and a response language', async () => {
    render(<GeneralSection />);

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.getByRole('combobox', { name: 'Technical level' })).toHaveValue('unspecified');
    expect(screen.getByRole('combobox', { name: 'Preferred formatting' })).toHaveValue(
      'unspecified',
    );
    expect(screen.getByRole('combobox', { name: 'Response language' })).toHaveValue('auto');
  });

  it('defaults the response language to matching the message rather than the interface', async () => {
    render(<GeneralSection />);

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    const select = screen.getByRole('combobox', { name: 'Response language' });
    expect(within(select).getByRole('option', { name: 'Match my message' })).toHaveValue('auto');
  });

  it('switches instructions off without emptying the field', async () => {
    const user = userEvent.setup();
    mocks.fetchPreferences.mockResolvedValue({ instructions: 'Always cite sources.' });
    render(<GeneralSection />);

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    const toggle = screen.getByRole('switch', { name: 'Apply instructions for AGI' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('textbox', { name: 'Instructions for AGI' })).toHaveValue(
      'Always cite sources.',
    );
    expect(screen.getByText(/are not sent to the model/i)).toBeVisible();
  });

  it('reads a stored off state back as off', async () => {
    mocks.fetchPreferences.mockResolvedValue({
      instructions: 'Always cite sources.',
      instructionsEnabled: false,
    });
    render(<GeneralSection />);

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.getByRole('switch', { name: 'Apply instructions for AGI' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

describe('GeneralSection preference save ordering', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockResolvedValue({});
    vi.mocked(savePreferenceNamespace).mockReset();
    vi.mocked(savePreferenceNamespace).mockResolvedValue({ version: null });
  });

  it('coalesces edits while a save is in flight without sending overlapping drafts', async () => {
    const first = deferred<{ version: null }>();
    vi.mocked(savePreferenceNamespace).mockImplementationOnce(() => first.promise);
    render(<GeneralSection />);
    const style = screen.getByRole('combobox', { name: 'Response style' });
    await waitFor(() => expect(style).toBeEnabled());
    await userEvent.selectOptions(style, 'concise');
    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalledTimes(2));
    await userEvent.selectOptions(style, 'formal');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(savePreferenceNamespace).toHaveBeenCalledTimes(2);
    await act(async () => {
      first.resolve({ version: null });
      await first.promise;
    });
    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalledTimes(4));
    expect(vi.mocked(savePreferenceNamespace).mock.calls.at(-1)?.slice(0, 2)).toEqual([
      'personalization',
      expect.objectContaining({ style: 'formal' }),
    ]);
  });

  it('retains a failed draft for explicit retry without repeatedly saving it', async () => {
    vi.mocked(savePreferenceNamespace).mockRejectedValueOnce(new Error('Service unavailable'));
    render(<GeneralSection />);
    const style = screen.getByRole('combobox', { name: 'Response style' });
    await waitFor(() => expect(style).toBeEnabled());
    await userEvent.selectOptions(style, 'formal');
    await screen.findByText('We could not save your preferences. Try Save profile again.');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(savePreferenceNamespace).toHaveBeenCalledTimes(2);
    expect(style).toHaveValue('formal');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Saved');
    expect(vi.mocked(savePreferenceNamespace).mock.calls.at(-1)?.slice(0, 2)).toEqual([
      'personalization',
      expect.objectContaining({ style: 'formal' }),
    ]);
  });

  it('includes the latest response style when Save profile is clicked before debounce', async () => {
    render(<GeneralSection />);
    const style = screen.getByRole('combobox', { name: 'Response style' });
    await waitFor(() => expect(style).toBeEnabled());
    await userEvent.selectOptions(style, 'formal');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Saved');
    expect(
      vi
        .mocked(savePreferenceNamespace)
        .mock.calls.find(([namespace]) => namespace === 'personalization')
        ?.slice(0, 2),
    ).toEqual(['personalization', expect.objectContaining({ style: 'formal' })]);
  });
});
