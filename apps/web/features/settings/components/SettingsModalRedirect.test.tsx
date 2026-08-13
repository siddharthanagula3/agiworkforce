import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openSettings: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  search: 'github=connected',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
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
    mocks.search = 'github=connected';
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
    mocks.search = `github=${status}`;

    render(<SettingsModalRedirect section="connectors" />);

    await waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith(message);
    });
    expect(mocks.replace).toHaveBeenCalledWith('/chat');
  });

  it('surfaces a confirmed top-up checkout return without claiming ledger settlement', async () => {
    mocks.search = 'topup=success&session_id=cs_test_123';

    render(<SettingsModalRedirect section="billing" />);

    await waitFor(() => {
      expect(mocks.success).toHaveBeenCalledWith(
        'Top-up payment received. Your balance updates after payment confirmation.',
      );
    });
    expect(mocks.openSettings).toHaveBeenCalledWith('billing');
  });

  it('reports a canceled top-up checkout as a no-charge outcome', async () => {
    mocks.search = 'topup=cancelled';

    render(<SettingsModalRedirect section="billing" />);

    await waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith(
        'Top-up checkout was canceled. No balance was added.',
      );
    });
  });
});
