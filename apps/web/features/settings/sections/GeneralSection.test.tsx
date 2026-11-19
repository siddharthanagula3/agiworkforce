import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import '@/app/i18n/index';
import { saveDisplayName, savePreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { GeneralSection } from './GeneralSection';
import { COMPOSER_FOLLOW_UP_INVERT_SHORTCUT, formatShortcutKeys } from '@agiworkforce/unified-chat';
import { safePlatform } from '@shared/utils/browser-utils';

const mocks = vi.hoisted(() => ({
  fetchPreferences: vi.fn(),
  setFollowUpBehavior: vi.fn(),
  settings: {
    followUpBehavior: 'queue' as 'queue' | 'steer',
  },
  tts: {
    isSupported: false,
    voices: [] as Array<{ voiceURI: string; name: string; lang: string }>,
  },
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

vi.mock('@shared/stores/web-settings-store', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({
      hiddenNavIds: [],
      setNavItemVisible: vi.fn(),
      sendWithEnter: true,
      setSendWithEnter: vi.fn(),
      followUpBehavior: mocks.settings.followUpBehavior,
      setFollowUpBehavior: mocks.setFollowUpBehavior,
    }),
}));

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
    mocks.tts.isSupported = false;
    mocks.tts.voices = [];
  });

  it('titles the section on phones like every other section, and only there', () => {
    render(<GeneralSection />);

    const title = screen.getByRole('heading', { level: 1, name: 'General' });
    expect(title.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['text-h1', 'font-medium', 'md:hidden']),
    );
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

describe('GeneralSection switches', () => {
  it('draws the follow-up suggestions switch as the shared switch, whose off state keeps a visible edge', () => {
    render(<GeneralSection />);

    const control = screen.getByRole('switch', { name: 'Show follow-up suggestions in chats' });
    expect(control).toHaveAttribute('data-state');
    expect(control.className).toContain(
      'data-[state=unchecked]:border-[color:var(--switch-off-edge)]',
    );
  });

  it('leaves the appearance controls to the Appearance page', () => {
    render(<GeneralSection />);

    expect(screen.queryByRole('group', { name: 'Theme' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Accent colour' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Motion' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Wrap long code lines' })).toBeNull();
    for (const name of ['Contrast', 'Chat font', 'Chat text size', 'Code theme']) {
      expect(screen.queryByRole('combobox', { name })).toBeNull();
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
    expect(screen.getByText(/uses a few credits per reply/i)).toBeVisible();
  });

  it('describes read-aloud without denying the separate voice mode', () => {
    render(<GeneralSection />);

    expect(screen.getByText(/The AGI voice uses a few credits per reply/i)).toBeVisible();
    expect(screen.queryByText(/no hands-free voice conversation/i)).toBeNull();
  });

  it('states how far display-language translation actually reaches', () => {
    render(<GeneralSection />);

    expect(screen.getByText(/Settings labels and conversations are unaffected/i)).toBeVisible();
  });

  it('explains the absence rather than hiding the row when no voices exist', () => {
    mocks.tts.isSupported = false;
    mocks.tts.voices = [];

    render(<GeneralSection />);

    expect(screen.getByText(/This browser has no voices/i)).toBeVisible();
  });
});

describe('GeneralSection row density', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
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

describe('GeneralSection composer captions', () => {
  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
    mocks.settings.followUpBehavior = 'queue';
    mocks.setFollowUpBehavior.mockReset();
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
      screen.getByText(`Queue or steer while AGI replies. ${keys} does the opposite once.`),
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
