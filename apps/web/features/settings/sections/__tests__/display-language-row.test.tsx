import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resources } from '@agiworkforce/i18n';
import i18n from '@/app/i18n/index';
type ScanModule0 = typeof import('@shared/stores/web-settings-store');

const mocks = vi.hoisted(() => ({
  fetchPreferences: vi.fn(),
}));

vi.mock('@shared/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));
vi.mock('@shared/stores/web-auth-store', async (importOriginal) => ({
  ...(await importOriginal()),
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
  savePreferenceNamespace: vi.fn(),
}));
vi.mock('@/features/settings/services/user-preferences', async (importOriginal) => ({
  ...(await importOriginal()),
  settingsService: { uploadAvatar: vi.fn(), updateProfile: vi.fn() },
}));
vi.mock('@shared/stores/model-store', async (importOriginal) => ({
  ...(await importOriginal()),
  useModelStore: (s: (v: unknown) => unknown) =>
    s({ selectedModelId: 'auto', setSelectedModel: vi.fn(), availableModels: [] }),
}));
vi.mock('@shared/stores/thinking-store', async (importOriginal) => ({
  ...(await importOriginal()),
  useThinkingStore: (s: (v: unknown) => unknown) =>
    s({ enabled: true, effort: 'medium', setEnabled: vi.fn(), setEffort: vi.fn() }),
}));
vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal()),
  getModelReasoning: () => ({ supportedEfforts: [] }),
  splitEffortsByEntitlement: () => ({ allowed: [], gated: [] }),
}));
vi.mock('@shared/stores/web-settings-store', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
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
vi.mock('@/lib/hooks/useTTS', async (importOriginal) => ({
  ...(await importOriginal()),
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
vi.mock('@/features/settings/components/CustomCommandsSettings', () => ({
  CustomCommandsSettings: () => null,
}));
vi.mock('@/features/chat/components/dialogs/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: () => null,
}));

import { GeneralSection } from '../GeneralSection';

const SCOPE_TAIL = {
  en: /conversations are unaffected/i,
  es: /siguen en inglés/i,
} as const;

function scopeCopy(locale: string): string {
  const corpus = resources as unknown as Record<string, Record<string, Record<string, string>>>;
  const copy = corpus[locale]?.['settings']?.['translationScope'];
  if (!copy) throw new Error(`settings:translationScope missing for ${locale}`);
  return copy;
}

function displayLanguageRow() {
  const label = screen.getByText('Display Language');
  const labelColumn = label.parentElement as HTMLElement;
  const row = labelColumn.parentElement as HTMLElement;
  const select = screen.getByRole('combobox', { name: 'Display language' });
  return { labelColumn, row, select };
}

beforeEach(() => {
  mocks.fetchPreferences.mockResolvedValue({});
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('Display Language row', () => {
  it('states the translation scope once, under the label', () => {
    render(<GeneralSection />);

    const { labelColumn, select } = displayLanguageRow();
    const helpers = screen.getAllByText(SCOPE_TAIL.en);

    expect(helpers).toHaveLength(1);
    expect(helpers[0]).toHaveTextContent(scopeCopy('en'));
    expect(labelColumn).toContainElement(helpers[0] as HTMLElement);
    expect(labelColumn).not.toContainElement(select);
  });

  it('describes the selector with that one helper', () => {
    render(<GeneralSection />);

    const { select } = displayLanguageRow();

    expect(select).toHaveAccessibleDescription(scopeCopy('en'));
  });

  it('translates the helper with the selected language and leaves no English copy behind', async () => {
    render(<GeneralSection />);

    const { select } = displayLanguageRow();
    fireEvent.change(select, { target: { value: 'es' } });

    await waitFor(() => expect(i18n.language).toBe('es'));
    await waitFor(() => expect(screen.getAllByText(SCOPE_TAIL.es)).toHaveLength(1));
    expect(screen.getByText(SCOPE_TAIL.es)).toHaveTextContent(scopeCopy('es'));
    expect(screen.queryByText(SCOPE_TAIL.en)).toBeNull();
    expect(select).toHaveAccessibleDescription(scopeCopy('es'));
  });

  it('keeps the selector as the only focus stop in the row', () => {
    render(<GeneralSection />);

    const { row, select } = displayLanguageRow();
    const focusStops = Array.from(
      row.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
    );

    expect(focusStops).toEqual([select]);
  });
});
