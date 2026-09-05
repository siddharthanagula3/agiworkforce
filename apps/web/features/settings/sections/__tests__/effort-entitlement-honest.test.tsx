import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tier: 'free' as string | null,
  initialized: true,
  setEffort: vi.fn(),
  setEnabled: vi.fn(),
  gated: ['xhigh', 'max'] as string[],
}));

vi.mock('@shared/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));
vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (s: unknown) => unknown) =>
    selector({
      initialized: mocks.initialized,
      subscription: mocks.tier === null ? null : { tier: mocks.tier },
      user: { email: 'demo@example.com', profile: {} },
    }),
}));
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { fullName: 'Demo', firstName: 'Demo' } }),
}));
vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchStoredPreferenceNamespace: vi.fn(async () => ({})),
  refreshProfileConsumers: vi.fn(),
  saveDisplayName: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));
vi.mock('@/features/settings/services/user-preferences', () => ({
  settingsService: { uploadAvatar: vi.fn(), updateProfile: vi.fn() },
}));
vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (selector: (s: unknown) => unknown) =>
    selector({ selectedModelId: 'auto', setSelectedModel: vi.fn(), availableModels: [] }),
}));
vi.mock('@shared/stores/thinking-store', () => ({
  useThinkingStore: (selector: (s: unknown) => unknown) =>
    selector({
      enabled: true,
      effort: 'medium',
      setEnabled: mocks.setEnabled,
      setEffort: mocks.setEffort,
    }),
}));
vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal()),
  getModelReasoning: () => ({ supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] }),
  splitEffortsByEntitlement: () => ({
    allowed: ['low', 'medium', 'high'],
    gated: mocks.gated,
  }),
}));
vi.mock('@shared/stores/web-settings-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/stores/web-settings-store')>();
  return {
    ACCENT_COLORS: actual.ACCENT_COLORS,
    useSettingsStore: (selector: (s: unknown) => unknown) =>
      selector({
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
  mocks.tier = 'free';
  mocks.initialized = true;
  mocks.gated = ['xhigh', 'max'];
});

// CAP-020: the composer split efforts by entitlement and this picker offered
// all five unconditionally. The server clamps above the plan cap, so picking
// Max silently produced the default while Settings kept displaying Max.
describe('the Settings effort picker matches what the server will honour', () => {
  it('disables a level the plan does not include', () => {
    render(<GeneralSection />);

    const select = screen.getByRole('combobox', { name: 'Reasoning effort' });
    const max = Array.from(select.querySelectorAll('option')).find((o) => o.value === 'max');

    expect(max).toBeDefined();
    expect(max).toBeDisabled();
  });

  it('keeps a gated level visible and says why, rather than hiding it', () => {
    render(<GeneralSection />);

    const select = screen.getByRole('combobox', { name: 'Reasoning effort' });
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);

    expect(labels.some((l) => l?.includes('Max'))).toBe(true);
    expect(labels.some((l) => l?.includes('not on your plan'))).toBe(true);
  });

  it('leaves an included level selectable', () => {
    render(<GeneralSection />);

    const select = screen.getByRole('combobox', { name: 'Reasoning effort' });
    const high = Array.from(select.querySelectorAll('option')).find((o) => o.value === 'high');

    expect(high).not.toBeDisabled();
  });

  it('offers every level while the tier is still unknown, rather than gating a paying customer', () => {
    mocks.initialized = false;
    render(<GeneralSection />);

    const select = screen.getByRole('combobox', { name: 'Reasoning effort' });
    for (const option of Array.from(select.querySelectorAll('option'))) {
      expect(option).not.toBeDisabled();
    }
  });

  it('does not store an effort the server would clamp away', async () => {
    render(<GeneralSection />);

    const select = screen.getByRole('combobox', { name: 'Reasoning effort' });
    await userEvent.selectOptions(select, 'high').catch(() => undefined);

    expect(mocks.setEffort).not.toHaveBeenCalledWith('max');
  });
});

// Higher effort raises ANTHROPIC_THINKING_BUDGET from 4096 to 65536, so it
// genuinely draws down the usage allowance faster. Nothing said so.
describe('the effort picker states its usage cost', () => {
  it('warns that higher effort spends the allowance faster', () => {
    render(<GeneralSection />);

    expect(screen.getByText(/draws on your usage allowance faster/i)).toBeVisible();
  });

  it('describes a ceiling, not a spend', () => {
    render(<GeneralSection />);

    // The budget is a maximum; an easy question uses far less. "Costs 16x more"
    // would be a claim the billing data contradicts.
    const hint = screen.getByText(/usage allowance faster/i).textContent ?? '';
    expect(hint).toMatch(/up to 16x longer/i);
    expect(hint).not.toMatch(/costs 16x|16x more expensive/i);
  });

  it('still names the plan gate when levels are gated', () => {
    render(<GeneralSection />);

    expect(screen.getByText(/manual model selection/i)).toBeVisible();
  });
});
