import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openSettings: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  githubStatus: 'connected',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(`github=${mocks.githubStatus}`),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.success,
    error: mocks.error,
  },
}));

vi.mock('./SettingsModalProvider', () => ({
  useSettingsModal: () => ({ openSettings: mocks.openSettings }),
}));

import { SettingsModalRedirect } from './SettingsModalRedirect';

describe('SettingsModalRedirect', () => {
  beforeEach(() => {
    mocks.githubStatus = 'connected';
    vi.clearAllMocks();
  });

  it('preserves a successful GitHub callback outcome before opening connector settings', async () => {
    render(<SettingsModalRedirect section="connectors" />);

    await waitFor(() => {
      expect(mocks.success).toHaveBeenCalledWith('GitHub connected.');
    });
    expect(mocks.openSettings).toHaveBeenCalledWith('connectors');
    expect(mocks.replace).toHaveBeenCalledWith('/chat');
  });

  it.each([
    ['invalid_state', 'GitHub connection failed a security check. Please try again.'],
    ['ownership_failed', 'GitHub could not verify that this installation belongs to your account.'],
    ['oauth_denied', 'GitHub authorization was canceled.'],
    ['oauth_failed', 'GitHub authorization failed. Please try again.'],
    ['already_linked', 'This GitHub installation is already linked to another AGI account.'],
    [
      'ownership_proof_required',
      'GitHub ownership verification is required. Start the connection again.',
    ],
  ])('surfaces the %s GitHub callback outcome', async (status, message) => {
    mocks.githubStatus = status;

    render(<SettingsModalRedirect section="connectors" />);

    await waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith(message);
    });
    expect(mocks.replace).toHaveBeenCalledWith('/chat');
  });
});
