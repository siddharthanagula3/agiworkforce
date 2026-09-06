import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchPreferences: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

vi.mock('@shared/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));
vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (s: unknown) => unknown) =>
    selector({
      initialized: true,
      subscription: { tier: 'pro' },
      user: { email: 'demo@example.com', profile: {} },
    }),
}));
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { fullName: 'Demo', firstName: 'Demo' } }),
}));
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchStoredPreferenceNamespace: mocks.fetchPreferences,
  refreshProfileConsumers: vi.fn(),
  saveDisplayName: vi.fn(),
  savePreferenceNamespace: mocks.savePreferenceNamespace,
}));
vi.mock('@/features/settings/services/user-preferences', () => ({
  settingsService: { uploadAvatar: vi.fn(), updateProfile: vi.fn() },
}));
vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (s: (v: unknown) => unknown) =>
    s({ selectedModelId: 'auto', setSelectedModel: vi.fn(), availableModels: [] }),
}));
vi.mock('@shared/stores/thinking-store', () => ({
  useThinkingStore: (s: (v: unknown) => unknown) =>
    s({ enabled: true, effort: 'medium', setEnabled: vi.fn(), setEffort: vi.fn() }),
}));
vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal()),
  getModelReasoning: () => ({ supportedEfforts: [] }),
  splitEffortsByEntitlement: () => ({ allowed: [], gated: [] }),
}));
vi.mock('@shared/stores/web-settings-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/stores/web-settings-store')>();
  return {
    ACCENT_COLORS: actual.ACCENT_COLORS,
    useSettingsStore: (s: (v: unknown) => unknown) =>
      s({
        chatTextSize: 'default',
        setChatTextSize: vi.fn(),
        codeBlockWrap: false,
        setCodeBlockWrap: vi.fn(),
        accentColor: 'default',
        setAccentColor: vi.fn(),
        highContrast: false,
        setHighContrast: vi.fn(),
        motion: 'system',
        hiddenNavIds: [],
        setNavItemVisible: vi.fn(),
        setMotion: vi.fn(),
      }),
  };
});
vi.mock('@/lib/hooks/useTTS', () => ({
  useTTS: () => ({
    isSupported: false,
    voices: [],
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

import { GeneralSection } from '../GeneralSection';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchPreferences.mockResolvedValue({});
  mocks.savePreferenceNamespace.mockResolvedValue(undefined);
});

// Web had no style controls at all; mobile's wrote to a namespace nothing read
// until today. Both surfaces must now write the SAME namespace the server
// reads, or they become two diverging copies of one preference.
describe('response style controls on web', () => {
  it('offers the same presets mobile ships', async () => {
    render(<GeneralSection />);

    const select = await screen.findByLabelText('Response style');
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['default', 'concise', 'explanatory', 'formal']);
  });

  it('offers all four characteristics', async () => {
    render(<GeneralSection />);

    for (const label of ['Warmth', 'Enthusiasm', 'Headers and lists', 'Emoji']) {
      expect(await screen.findByLabelText(label)).toBeVisible();
    }
  });

  it('persists to the personalization namespace the server actually reads', async () => {
    render(<GeneralSection />);

    const select = await screen.findByLabelText('Response style');
    await userEvent.selectOptions(select, 'concise');

    await waitFor(
      () => {
        const call = mocks.savePreferenceNamespace.mock.calls.find(
          ([ns]) => ns === 'personalization',
        );
        expect(call).toBeDefined();
        expect((call?.[1] as { style: string }).style).toBe('concise');
      },
      { timeout: 3000 },
    );
  });

  it('hydrates a stored level rather than snapping it back to neutral', async () => {
    mocks.fetchPreferences.mockImplementation(async (ns: string) =>
      ns === 'personalization' ? { style: 'formal', emoji: 0 } : {},
    );

    render(<GeneralSection />);

    await waitFor(async () => expect(await screen.findByLabelText('Emoji')).toHaveValue('less'));
    expect(await screen.findByLabelText('Response style')).toHaveValue('formal');
  });

  it('describes the level to assistive technology in words, not just by position', async () => {
    mocks.fetchPreferences.mockImplementation(async (ns: string) =>
      ns === 'personalization' ? { emoji: 0 } : {},
    );

    render(<GeneralSection />);

    const emoji = (await screen.findByLabelText('Emoji')) as HTMLSelectElement;
    await waitFor(() => expect(emoji.selectedOptions[0]?.textContent).toBe('Less'));
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
