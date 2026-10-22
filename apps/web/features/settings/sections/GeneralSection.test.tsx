import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import '@/app/i18n/index';
import { saveDisplayName, savePreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { GeneralSection } from './GeneralSection';
import { ACCENT_COLORS } from '@shared/stores/web-settings-store';
import { COMPOSER_FOLLOW_UP_INVERT_SHORTCUT, formatShortcutKeys } from '@agiworkforce/unified-chat';
import { safePlatform } from '@shared/utils/browser-utils';
type ScanModule0 = typeof import('@shared/stores/web-settings-store');

const mocks = vi.hoisted(() => ({
  fetchPreferences: vi.fn(),
  setAccentColor: vi.fn(),
  setHighContrast: vi.fn(),
  setCodeTheme: vi.fn(),
  setMotion: vi.fn(),
  setFollowUpBehavior: vi.fn(),
  settings: {
    accentColor: 'default' as string,
    highContrast: false,
    motion: 'system' as 'system' | 'reduced',
    followUpBehavior: 'queue' as 'queue' | 'steer',
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
  const actual = await importOriginal<ScanModule0>();
  return {
    ACCENT_COLORS: actual.ACCENT_COLORS,
    useSettingsStore: (selector: (state: unknown) => unknown) =>
      selector({
        chatTextSize: 'default',
        setChatTextSize: vi.fn(),
        codeBlockWrap: false,
        setCodeBlockWrap: vi.fn(),
        codeTheme: 'github',
        setCodeTheme: mocks.setCodeTheme,
        motion: mocks.settings.motion,
        hiddenNavIds: [],
        setNavItemVisible: vi.fn(),
        setMotion: mocks.setMotion,
        accentColor: mocks.settings.accentColor,
        setAccentColor: mocks.setAccentColor,
        highContrast: mocks.settings.highContrast,
        setHighContrast: mocks.setHighContrast,
        sendWithEnter: true,
        setSendWithEnter: vi.fn(),
        followUpBehavior: mocks.settings.followUpBehavior,
        setFollowUpBehavior: mocks.setFollowUpBehavior,
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

  it('leaves response style, instructions and memory to Personalization and links there', () => {
    render(<GeneralSection />);

    expect(screen.queryByRole('combobox', { name: 'Response style' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Instructions for AGI/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'More about you' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Warmth' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Personalization' })).toHaveAttribute(
      'href',
      '/settings/personalization',
    );
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

  it('offers Contrast as a System or High choice that follows the device on System', async () => {
    render(<GeneralSection />);

    expect(screen.queryByRole('switch', { name: 'High contrast' })).toBeNull();
    const contrast = screen.getByRole('combobox', { name: 'Contrast' });
    expect(contrast).toHaveValue('system');
    expect(
      within(contrast)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['System', 'High']);
    expect(screen.getByText('System follows your device setting.')).toBeVisible();

    await userEvent.selectOptions(contrast, 'high');
    expect(mocks.setHighContrast).toHaveBeenLastCalledWith(true);
  });

  it('reads a stored high contrast preference back as High and can return to System', async () => {
    mocks.settings.highContrast = true;
    render(<GeneralSection />);

    const contrast = screen.getByRole('combobox', { name: 'Contrast' });
    expect(contrast).toHaveValue('high');

    await userEvent.selectOptions(contrast, 'system');
    expect(mocks.setHighContrast).toHaveBeenLastCalledWith(false);
  });

  it('offers only code themes that stay readable and saves the one picked', async () => {
    render(<GeneralSection />);

    const select = screen.getByRole('combobox', { name: 'Code theme' });
    expect(select).toHaveValue('github');
    expect(
      Array.from(select.querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual([
      'GitHub',
      'GitHub dimmed',
      'GitHub high contrast',
      'Catppuccin',
      'Dracula soft',
      'Everforest',
    ]);

    await userEvent.selectOptions(select, 'catppuccin');

    expect(mocks.setCodeTheme).toHaveBeenCalledWith('catppuccin');
  });

  it('draws every on/off switch as the shared switch, whose off state keeps a visible edge', () => {
    render(<GeneralSection />);

    for (const name of ['Wrap long code lines', 'Show follow-up suggestions in chats']) {
      const control = screen.getByRole('switch', { name });
      expect(control).toHaveAttribute('data-state');
      expect(control.className).toContain(
        'data-[state=unchecked]:border-[color:var(--switch-off-edge)]',
      );
    }
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

    expect(screen.getByRole('combobox', { name: 'Backup read-aloud voice' })).toBeVisible();
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

    expect(screen.getByText(/no speech voices of its own/i)).toBeVisible();
  });
});

describe('GeneralSection row density', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
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

describe('GeneralSection profile save', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockResolvedValue({});
    vi.mocked(savePreferenceNamespace).mockReset();
    vi.mocked(savePreferenceNamespace).mockResolvedValue({ version: null });
    vi.mocked(saveDisplayName).mockReset();
  });

  it('saves an edited full name to the account, trimmed', async () => {
    render(<GeneralSection />);
    const fullName = screen.getByRole('textbox', { name: 'Full name' });
    await waitFor(() => expect(fullName).toBeEnabled());

    await userEvent.clear(fullName);
    await userEvent.type(fullName, '  Ada Lovelace  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await screen.findByText('Saved');
    expect(vi.mocked(saveDisplayName)).toHaveBeenLastCalledWith('Ada Lovelace');
    expect(savePreferenceNamespace).not.toHaveBeenCalled();
  });

  it('keeps Save profile unavailable while the full name is empty', async () => {
    render(<GeneralSection />);
    const fullName = screen.getByRole('textbox', { name: 'Full name' });
    await waitFor(() => expect(fullName).toBeEnabled());

    await userEvent.clear(fullName);

    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    expect(vi.mocked(saveDisplayName)).not.toHaveBeenCalled();
  });
});

describe('GeneralSection composer and theme captions', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
    mocks.settings.followUpBehavior = 'queue';
    mocks.setFollowUpBehavior.mockReset();
  });

  it('captions each theme option with its visible name', () => {
    render(<GeneralSection />);

    const group = screen.getByRole('group', { name: 'Theme' });
    for (const name of ['System', 'Light', 'Dark']) {
      const option = within(group).getByRole('button', { name: `${name} theme` });
      expect(option).toHaveTextContent(name);
    }
  });

  it('groups the send and follow-up controls under a Composer heading', () => {
    render(<GeneralSection />);

    const composer = screen.getByRole('region', { name: 'Composer' });
    expect(within(composer).getByRole('switch', { name: 'Send with Enter' })).toBeVisible();
    expect(within(composer).getByRole('group', { name: 'Follow-up behavior' })).toBeVisible();
  });

  it('offers follow-up behavior as a Queue or Steer choice that marks the saved one', async () => {
    render(<GeneralSection />);

    const group = screen.getByRole('group', { name: 'Follow-up behavior' });
    expect(screen.queryByRole('combobox', { name: 'Follow-up behavior' })).toBeNull();
    expect(within(group).getByRole('button', { name: 'Queue' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('button', { name: 'Steer' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await userEvent.click(within(group).getByRole('button', { name: 'Steer' }));

    expect(mocks.setFollowUpBehavior).toHaveBeenCalledWith('steer');
  });

  it('names the shortcut that sends one follow-up the other way', () => {
    render(<GeneralSection />);

    const keys = formatShortcutKeys(COMPOSER_FOLLOW_UP_INVERT_SHORTCUT, safePlatform.isMac()).join(
      ' + ',
    );
    expect(
      screen.getByText(
        `Queue follow-ups while AGI replies or steer the current reply. Press ${keys} to do the opposite for one message.`,
      ),
    ).toBeVisible();
  });

  it('links Open source licenses to the generated notices page in a new tab', () => {
    render(<GeneralSection />);

    const view = screen.getByRole('link', { name: 'View open source licenses' });
    expect(view).toHaveTextContent('View');
    expect(view).toHaveAttribute('href', '/legal/open-source');
    expect(view).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Third-party notices for bundled dependencies.')).toBeVisible();
  });
});
