import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useWorkspaceApiKeys: vi.fn(),
  createMutate: vi.fn(),
  revokeMutate: vi.fn(),
}));

vi.mock('../../hooks/use-admin-api-keys', () => ({
  useWorkspaceApiKeys: mocks.useWorkspaceApiKeys,
  useCreateWorkspaceApiKey: () => ({
    mutate: mocks.createMutate,
    isPending: false,
    isError: false,
  }),
  useRevokeWorkspaceApiKey: () => ({
    mutate: mocks.revokeMutate,
    isPending: false,
    isError: false,
  }),
}));

import { WorkspaceApiKeys } from '../WorkspaceApiKeys';

const KEY = {
  id: 'key-1',
  name: 'SIEM',
  keyPrefix: 'agiadm_AbCdEf12',
  scopes: ['audit.read'],
  createdBy: 'user-1',
  createdAt: '2026-09-17T00:00:00.000Z',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
};

function bind(canManageKeys: boolean) {
  mocks.useWorkspaceApiKeys.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      organizationId: 'org',
      canManageKeys,
      grantableScopes: ['audit.read', 'content.govern'],
      keys: [KEY],
    },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('WorkspaceApiKeys', () => {
  it('creates a key with the chosen permissions and shows the secret once', async () => {
    bind(true);
    mocks.createMutate.mockImplementation((_input, options) =>
      options.onSuccess({ key: 'agiadm_AbCdEf12_secret', record: KEY }),
    );
    const user = userEvent.setup();
    render(<WorkspaceApiKeys />);

    await user.type(screen.getByLabelText('Workspace API key name'), 'SIEM export');
    await user.click(screen.getByLabelText('Read the audit trail and usage'));
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    expect(mocks.createMutate).toHaveBeenCalledWith(
      { name: 'SIEM export', scopes: ['audit.read'], expiresInDays: 90 },
      expect.anything(),
    );
    const notice = screen.getByRole('region', { name: 'New workspace API key' });
    expect(within(notice).getByText('agiadm_AbCdEf12_secret')).toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'I have stored it' }));
    expect(screen.queryByText('agiadm_AbCdEf12_secret')).toBeNull();
  });

  it('asks before revoking and names what stops working', async () => {
    bind(true);
    const user = userEvent.setup();
    render(<WorkspaceApiKeys />);

    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(mocks.revokeMutate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('loses access');
    mocks.revokeMutate.mockImplementation((_id, options) => options.onSettled());
    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }));

    await waitFor(() =>
      expect(mocks.revokeMutate).toHaveBeenCalledWith('key-1', expect.anything()),
    );
  });

  it('lists keys read-only for a role that cannot manage them', () => {
    bind(false);
    render(<WorkspaceApiKeys />);

    expect(screen.getByText('SIEM')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create key' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });
});
