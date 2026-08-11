import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneralSection } from './GeneralSection';

const mocks = vi.hoisted(() => ({
  fetchPreferences: vi.fn(),
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

vi.mock('@/app/settings/_lib/preferences-client', () => ({
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
      chatTextSize: 'default',
      setChatTextSize: vi.fn(),
      codeBlockWrap: false,
      setCodeBlockWrap: vi.fn(),
    }),
}));

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
