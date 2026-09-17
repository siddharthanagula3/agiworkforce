import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RETENTION_DOMAINS } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  useDomainRetention: vi.fn(),
  useSaveDomainRetention: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('../../hooks/use-domain-retention', () => ({
  useDomainRetention: mocks.useDomainRetention,
  useSaveDomainRetention: mocks.useSaveDomainRetention,
}));

import { WorkspaceDomainRetention } from '../WorkspaceDomainRetention';

function policies(overrides: Record<string, { retentionDays: number; enforced: boolean }> = {}) {
  return RETENTION_DOMAINS.map((domain) => ({
    domain,
    retentionDays: overrides[domain]?.retentionDays ?? 365,
    enforced: overrides[domain]?.enforced ?? false,
    updatedAt: null,
  }));
}

function bind(canManageRetention = true, data = policies()) {
  mocks.useDomainRetention.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: { organizationId: 'org', canManageRetention, policies: data, sweeps: [] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutate.mockImplementation((_input, options) => options?.onSettled?.());
  mocks.useSaveDomainRetention.mockReturnValue({
    mutate: mocks.mutate,
    isPending: false,
    isError: false,
    error: null,
  });
});

describe('WorkspaceDomainRetention', () => {
  it('shows a separate window for every data type', () => {
    bind();
    render(<WorkspaceDomainRetention />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(RETENTION_DOMAINS.length);
    expect(screen.getByLabelText('Retention days for Code sessions')).toHaveValue(365);
  });

  it('asks before enforcing deletion, and saves only that data type on confirm', async () => {
    bind();
    const user = userEvent.setup();
    render(<WorkspaceDomainRetention />);

    await user.click(screen.getByLabelText('Enforce retention for Notifications'));
    const days = screen.getByLabelText('Retention days for Notifications');
    await user.clear(days);
    await user.type(days, '30');
    const row = days.closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Save' }));

    expect(mocks.mutate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('cannot be recovered');
    await user.click(within(dialog).getByRole('button', { name: 'Enforce retention' }));

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        [{ domain: 'notifications', retentionDays: 30, enforced: true, updatedAt: null }],
        expect.anything(),
      ),
    );
  });

  it('saves turning enforcement off without a warning', async () => {
    bind(true, policies({ files: { retentionDays: 30, enforced: true } }));
    const user = userEvent.setup();
    render(<WorkspaceDomainRetention />);

    await user.click(screen.getByLabelText('Enforce retention for Files and generated media'));
    const row = screen
      .getByLabelText('Retention days for Files and generated media')
      .closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mocks.mutate).toHaveBeenCalled();
  });

  it('is read-only for a role that may view but not change retention', () => {
    bind(false);
    render(<WorkspaceDomainRetention />);

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByLabelText('Enforce retention for Work runs')).toBeDisabled();
  });
});
