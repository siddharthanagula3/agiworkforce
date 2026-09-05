import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadAvatar: vi.fn(),
  updateProfile: vi.fn(),
  refreshProfileConsumers: vi.fn(),
  avatarUrl: null as string | null,
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
        avatar_url: mocks.avatarUrl,
        profile: { display_name: 'Demo User', preferred_name: 'Demo' },
      },
    }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { fullName: 'Demo User', firstName: 'Demo' } }),
}));

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchStoredPreferenceNamespace: vi.fn(async () => ({})),
  refreshProfileConsumers: mocks.refreshProfileConsumers,
  saveDisplayName: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

vi.mock('@/features/settings/services/user-preferences', () => ({
  settingsService: { uploadAvatar: mocks.uploadAvatar, updateProfile: mocks.updateProfile },
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
        accentColor: 'default',
        setAccentColor: vi.fn(),
        highContrast: false,
        setHighContrast: vi.fn(),
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

import { MAX_AVATAR_BYTES } from '@agiworkforce/types';
import { GeneralSection } from '../GeneralSection';

function png(name = 'me.png', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.avatarUrl = null;
  mocks.uploadAvatar.mockResolvedValue({ data: 'https://cdn.example.com/a.png' });
  mocks.updateProfile.mockResolvedValue({});
});

describe('avatar upload is reachable from General settings', () => {
  it('sends the picked file through the upload service and refreshes the profile', async () => {
    render(<GeneralSection />);

    const input = screen.getByLabelText('Profile photo');
    const file = png();
    await userEvent.upload(input, file);

    await waitFor(() => expect(mocks.uploadAvatar).toHaveBeenCalledWith(file));
    await waitFor(() => expect(mocks.refreshProfileConsumers).toHaveBeenCalled());
  });

  it('rejects an oversized image before it reaches the network', async () => {
    render(<GeneralSection />);

    await userEvent.upload(
      screen.getByLabelText('Profile photo'),
      png('big.png', MAX_AVATAR_BYTES + 1),
    );

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(mocks.uploadAvatar).not.toHaveBeenCalled();
  });

  it('rejects a file type the presign endpoint would refuse', async () => {
    render(<GeneralSection />);

    const input = screen.getByLabelText('Profile photo') as HTMLInputElement;
    expect(input.accept).not.toContain('svg');

    const svg = new File(['<svg />'], 'x.svg', { type: 'image/svg+xml' });
    fireEvent.change(input, { target: { files: [svg] } });

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(mocks.uploadAvatar).not.toHaveBeenCalled();
  });

  it('surfaces an upload failure instead of pretending it saved', async () => {
    mocks.uploadAvatar.mockResolvedValue({ data: '', error: 'Upload failed (HTTP 500)' });
    render(<GeneralSection />);

    await userEvent.upload(screen.getByLabelText('Profile photo'), png());

    expect(await screen.findByText('Upload failed (HTTP 500)')).toBeVisible();
    expect(mocks.refreshProfileConsumers).not.toHaveBeenCalled();
  });

  it('shows the stored photo and offers removal once one exists', async () => {
    mocks.avatarUrl = 'https://cdn.example.com/a.png';
    render(<GeneralSection />);

    expect(screen.getByAltText('Your profile photo')).toHaveAttribute(
      'src',
      'https://cdn.example.com/a.png',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ avatar_url: null }));
    await waitFor(() => expect(mocks.refreshProfileConsumers).toHaveBeenCalled());
  });
});
