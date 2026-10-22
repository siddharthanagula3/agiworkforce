import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { SettingsModal } from '@agiworkforce/ui';

import { GeneralSection } from '../../sections/GeneralSection';
import { WEB_SETTINGS_NAV_GROUPS } from '../web-settings-navigation';

type SettingsStoreModule = typeof import('@shared/stores/web-settings-store');

const mocks = vi.hoisted(() => ({ fetchPreferences: vi.fn() }));

vi.mock('@shared/hooks/useAppTheme', () => ({
  useAppTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));

vi.mock('@shared/stores/web-auth-store', async (importOriginal) => ({
  ...(await importOriginal()),
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

vi.mock('@shared/stores/model-store', async (importOriginal) => ({
  ...(await importOriginal()),
  useModelStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedModelId: 'auto', setSelectedModel: vi.fn(), availableModels: [] }),
}));

vi.mock('@shared/stores/thinking-store', async (importOriginal) => ({
  ...(await importOriginal()),
  useThinkingStore: (selector: (state: unknown) => unknown) =>
    selector({ enabled: false, effort: 'medium', setEnabled: vi.fn(), setEffort: vi.fn() }),
}));

vi.mock('@shared/stores/web-settings-store', async (importOriginal) => {
  const actual = await importOriginal<SettingsStoreModule>();
  return {
    ACCENT_COLORS: actual.ACCENT_COLORS,
    useSettingsStore: (selector: (state: unknown) => unknown) =>
      selector({
        chatFont: 'default',
        setChatFont: vi.fn(),
        chatTextSize: 'default',
        setChatTextSize: vi.fn(),
        codeBlockWrap: false,
        setCodeBlockWrap: vi.fn(),
        motion: 'system',
        hiddenNavIds: [],
        setNavItemVisible: vi.fn(),
        setMotion: vi.fn(),
        accentColor: 'default',
        setAccentColor: vi.fn(),
        highContrast: false,
        setHighContrast: vi.fn(),
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

vi.mock('@/features/settings/components/LanguageSelector', () => ({
  LanguageSelector: () => null,
}));

vi.mock('@/features/settings/components/CustomCommandsSettings', () => ({
  CustomCommandsSettings: () => null,
}));

vi.mock('@/features/chat/components/dialogs/KeyboardShortcutsDialog', () => ({
  KeyboardShortcutsDialog: () => null,
}));

function WebSettingsSearchHarness() {
  const [section, setSection] = useState('billing');
  return (
    <SettingsModal
      open
      onClose={vi.fn()}
      activeSection={section}
      onSectionChange={setSection}
      navGroups={WEB_SETTINGS_NAV_GROUPS}
      sectionContent={{ general: <GeneralSection />, billing: <p>Billing content</p> }}
    />
  );
}

function searchSettings(query: string): HTMLElement {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
    target: { value: query },
  });
  return screen.getByRole('navigation', { name: 'Settings navigation' });
}

function resultLabels(nav: HTMLElement): string[] {
  return within(nav)
    .queryAllByRole('button')
    .filter((button) => button.getAttribute('aria-controls') === 'settings-pane')
    .map((button) => button.textContent ?? '');
}

const GENERAL_FIELDS =
  WEB_SETTINGS_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.key === 'general')
    ?.fields ?? [];

describe('web settings search reaches the chat font controls', () => {
  let scrollIntoView: MockInstance<HTMLElement['scrollIntoView']>;

  beforeEach(() => {
    mocks.fetchPreferences.mockReset();
    mocks.fetchPreferences.mockResolvedValue({});
    scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
  });

  afterEach(() => {
    scrollIntoView.mockRestore();
  });

  it.each([
    ['font', 'Chat font'],
    ['chat font', 'Chat font'],
    ['typeface', 'Chat font'],
    ['serif', 'Chat font'],
    ['dyslexia', 'Chat font'],
    ['text size', 'Chat text size'],
    ['Chat text size', 'Chat text size'],
    ['font size', 'Chat text size'],
  ])('"%s" lists General and selecting it focuses %s', (query, control) => {
    render(<WebSettingsSearchHarness />);
    const nav = searchSettings(query);

    expect(resultLabels(nav)).toEqual(['General']);
    expect(within(nav).queryByText('No matches.')).toBeNull();

    fireEvent.click(within(nav).getByRole('button', { name: 'General' }));

    const target = screen.getByRole('combobox', { name: control });
    expect(document.activeElement).toBe(target);
    expect(scrollIntoView.mock.contexts).toContain(target);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'center' });
  });

  it('indexes only controls the General section really renders', () => {
    render(<GeneralSection />);

    expect(GENERAL_FIELDS.map((field) => field.label)).toEqual(['Chat font', 'Chat text size']);
    for (const field of GENERAL_FIELDS) {
      expect(screen.getByRole('combobox', { name: field.label })).toBeEnabled();
    }
  });

  it('leaves searches for other settings as they were', () => {
    render(<WebSettingsSearchHarness />);

    expect(resultLabels(searchSettings('custom instructions'))).toEqual(['Personalization']);
    expect(resultLabels(searchSettings('profile'))).toEqual(['General']);
    expect(resultLabels(searchSettings('invoice'))).toEqual(['Billing']);
    expect(resultLabels(searchSettings('dictation'))).toEqual(['Voice']);
    expect(resultLabels(searchSettings('remember'))).toEqual(['Personalization']);
    expect(resultLabels(searchSettings('memory'))).toEqual(['Personalization']);
    expect(resultLabels(searchSettings('referral link'))).toEqual(['Referrals']);

    const nav = searchSettings('no such setting');
    expect(resultLabels(nav)).toEqual([]);
    expect(within(nav).getByText('No matches.')).toBeTruthy();
  });

  it('moves focus to no control for a query that names the section rather than a control', () => {
    render(<WebSettingsSearchHarness />);
    const nav = searchSettings('profile');

    fireEvent.click(within(nav).getByRole('button', { name: 'General' }));

    expect(screen.getByRole('combobox', { name: 'Chat font' })).toBeTruthy();
    expect(document.activeElement?.tagName).not.toBe('SELECT');
    expect(scrollIntoView).not.toHaveBeenCalledWith({ block: 'center' });
  });

  it('moves focus to no control when General is picked without a search', () => {
    render(<WebSettingsSearchHarness />);
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });

    fireEvent.click(within(nav).getByRole('button', { name: 'General' }));

    expect(screen.getByRole('combobox', { name: 'Chat font' })).toBeTruthy();
    expect(document.activeElement?.tagName).not.toBe('SELECT');
    expect(scrollIntoView).not.toHaveBeenCalledWith({ block: 'center' });
  });
});
