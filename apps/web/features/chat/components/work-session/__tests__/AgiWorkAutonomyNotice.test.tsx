import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fetchPreferenceNamespace = vi.hoisted(() => vi.fn());
vi.mock('@/app/settings/_lib/preferences-client', () => ({ fetchPreferenceNamespace }));

import { AgiWorkAutonomyNotice } from '../AgiWorkAutonomyNotice';
import { useUIStore } from '@shared/stores/layout-store';

const NOTICE = /Automatic approval is on/;

function autoApproves() {
  fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: 'auto_approve_read_only' });
}

beforeEach(() => {
  vi.clearAllMocks();
  useUIStore.setState({ agiWorkAutonomyNoticeDismissed: false });
  fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: 'ask_every_time' });
});

// Claude Cowork keeps a standing disclosure above the composer naming exactly
// what an automatically approved run may do on its own. Ours disclosed nothing.
describe('AGI Work autonomy disclosure', () => {
  it('discloses automatic approval while an AGI Work session is active', async () => {
    autoApproves();
    render(<AgiWorkAutonomyNotice active onReviewApprovals={vi.fn()} />);

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByText(NOTICE).textContent).toContain(
      'including when it uses your connectors',
    );
  });

  it('stays silent in Chat mode', async () => {
    autoApproves();
    render(<AgiWorkAutonomyNotice active={false} onReviewApprovals={vi.fn()} />);

    await waitFor(() => expect(fetchPreferenceNamespace).not.toHaveBeenCalled());
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('stays silent when every action still asks first', async () => {
    render(<AgiWorkAutonomyNotice active onReviewApprovals={vi.fn()} />);

    await waitFor(() => expect(fetchPreferenceNamespace).toHaveBeenCalled());
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('claims nothing about a policy it could not read', async () => {
    fetchPreferenceNamespace.mockRejectedValue(new Error('offline'));
    render(<AgiWorkAutonomyNotice active onReviewApprovals={vi.fn()} />);

    await waitFor(() => expect(fetchPreferenceNamespace).toHaveBeenCalled());
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('routes the reader to the approvals surface', async () => {
    autoApproves();
    const onReviewApprovals = vi.fn();
    render(<AgiWorkAutonomyNotice active onReviewApprovals={onReviewApprovals} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Review approvals' }));

    expect(onReviewApprovals).toHaveBeenCalledTimes(1);
  });

  it('stays dismissed for the rest of the session once dismissed', async () => {
    autoApproves();
    const { unmount } = render(<AgiWorkAutonomyNotice active onReviewApprovals={vi.fn()} />);

    await screen.findByText(NOTICE);
    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss automatic approval notice' }),
    );
    expect(screen.queryByText(NOTICE)).toBeNull();

    unmount();
    render(<AgiWorkAutonomyNotice active onReviewApprovals={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText(NOTICE)).toBeNull());
  });

  it('is owed again in a fresh session rather than silenced for good', () => {
    useUIStore.getState().dismissAgiWorkAutonomyNotice();

    expect(
      JSON.parse(String(window.localStorage.getItem('agi-ui-store') ?? '{}')) as {
        state?: Record<string, unknown>;
      },
    ).not.toHaveProperty('state.agiWorkAutonomyNoticeDismissed');
  });
});
