import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY,
  ARTIFACT_STORAGE_NOTICE_DISMISS_LABEL,
  ARTIFACT_STORAGE_NOTICE_SAVED,
  ARTIFACT_STORAGE_NOTICE_SETTINGS_LABEL,
  ARTIFACT_STORAGE_NOTICE_SHARED,
  ARTIFACT_STORAGE_NOTICE_TITLE,
} from '../lib/artifact-storage-notice-copy';
import { ArtifactPrivacyNotice } from './ArtifactPrivacyNotice';

const mocks = vi.hoisted(() => ({ openSettings: vi.fn(), closeSettings: vi.fn() }));

vi.mock('@/features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/settings/components/SettingsModalProvider')
  >()),
  useSettingsModal: () => ({
    isOpen: false,
    openSettings: mocks.openSettings,
    closeSettings: mocks.closeSettings,
  }),
}));

const SUPERSEDED_STORAGE_KEY = 'agi:artifact-privacy-notice-seen';

describe('ArtifactPrivacyNotice', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.openSettings.mockReset();
    mocks.closeSettings.mockReset();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('shows the notice the first time the panel opens', async () => {
    render(<ArtifactPrivacyNotice />);

    expect(await screen.findByText(ARTIFACT_STORAGE_NOTICE_TITLE)).toBeInTheDocument();
  });

  it('says where artifacts are saved and what gives other people access', async () => {
    render(<ArtifactPrivacyNotice />);

    const notice = await screen.findByRole('alert');

    expect(screen.getByText(ARTIFACT_STORAGE_NOTICE_SAVED)).toBeInTheDocument();
    expect(screen.getByText(ARTIFACT_STORAGE_NOTICE_SHARED)).toBeInTheDocument();
    expect(notice.textContent).toContain('saved to your account automatically');
    expect(notice.textContent).toContain('except in temporary chats');
    expect(notice.textContent).toContain('chats that use a local model');
    expect(notice.textContent).not.toContain('leaves this device');
    expect(notice.textContent).not.toContain('BYOK');
  });

  it('dismisses on acknowledgement and remembers that choice', async () => {
    const user = userEvent.setup();
    render(<ArtifactPrivacyNotice />);

    await user.click(
      await screen.findByRole('button', { name: ARTIFACT_STORAGE_NOTICE_DISMISS_LABEL }),
    );

    expect(screen.queryByText(ARTIFACT_STORAGE_NOTICE_TITLE)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY)).toBe('1');
  });

  it('opens Privacy settings without dismissing the notice', async () => {
    const user = userEvent.setup();
    render(<ArtifactPrivacyNotice />);

    await user.click(
      await screen.findByRole('button', { name: ARTIFACT_STORAGE_NOTICE_SETTINGS_LABEL }),
    );

    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
    expect(mocks.openSettings).toHaveBeenCalledWith('privacy');
    expect(screen.getByText(ARTIFACT_STORAGE_NOTICE_TITLE)).toBeInTheDocument();
    expect(window.localStorage.getItem(ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY)).toBeNull();
  });

  it('does not render again once the notice was already seen', async () => {
    window.localStorage.setItem(ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY, '1');

    const seen = render(<ArtifactPrivacyNotice />);

    expect(screen.queryByText(ARTIFACT_STORAGE_NOTICE_TITLE)).not.toBeInTheDocument();

    seen.unmount();
    window.localStorage.removeItem(ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY);
    render(<ArtifactPrivacyNotice />);

    expect(await screen.findByText(ARTIFACT_STORAGE_NOTICE_TITLE)).toBeInTheDocument();
  });

  it('a flag under the old key does not hide the corrected notice', async () => {
    expect(ARTIFACT_PRIVACY_NOTICE_STORAGE_KEY).not.toBe(SUPERSEDED_STORAGE_KEY);
    window.localStorage.setItem(SUPERSEDED_STORAGE_KEY, '1');

    render(<ArtifactPrivacyNotice />);

    expect(await screen.findByText(ARTIFACT_STORAGE_NOTICE_TITLE)).toBeInTheDocument();
  });
});
