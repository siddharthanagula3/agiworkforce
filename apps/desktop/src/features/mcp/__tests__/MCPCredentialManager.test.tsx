import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import MCPCredentialManager from '../MCPCredentialManager';
import type {
  McpCredentialSlot,
  McpOAuthConnectionStatus,
  McpOAuthTokenResponse,
  McpServerInfo,
} from '../../../types/mcp';

vi.mock('../../../api/mcp', () => ({
  McpClient: {
    oauthStatus: vi.fn(),
    oauthCallback: vi.fn(),
    oauthStart: vi.fn(),
    oauthDisconnect: vi.fn(),
    listCredentialSlots: vi.fn(),
    setCredential: vi.fn(),
    deleteCredential: vi.fn(),
  },
}));

interface McpClientMocks {
  oauthStatus: Mock<(provider: string) => Promise<McpOAuthConnectionStatus>>;
  oauthCallback: Mock<
    (provider: string, code: string, callbackState: string) => Promise<McpOAuthTokenResponse>
  >;
  oauthStart: Mock;
  oauthDisconnect: Mock;
  listCredentialSlots: Mock<() => Promise<McpCredentialSlot[]>>;
  setCredential: Mock<(serverName: string, key: string, value: string) => Promise<string>>;
  deleteCredential: Mock<(serverName: string, key: string) => Promise<string>>;
}

async function getMcpClientMock(): Promise<McpClientMocks> {
  const { McpClient } = await import('../../../api/mcp');
  return McpClient as unknown as McpClientMocks;
}

const servers: McpServerInfo[] = [
  {
    name: 'github',
    enabled: true,
    connected: false,
    toolCount: 0,
  },
];

describe('MCPCredentialManager', () => {
  let mcpMock: McpClientMocks;
  const storeOAuthState = (provider: string, state: string) => {
    sessionStorage.setItem(`_csrf_${provider}`, btoa(state));
  };

  beforeEach(async () => {
    sessionStorage.clear();
    mcpMock = await getMcpClientMock();
    Object.values(mcpMock).forEach((mock) => mock.mockReset());
    mcpMock.oauthStatus.mockResolvedValue({
      connected: false,
      userInfo: null,
      expiresAt: null,
    });
    mcpMock.oauthCallback.mockResolvedValue({
      provider: 'github',
      connected: true,
      expiresAt: null,
    });
    mcpMock.listCredentialSlots.mockResolvedValue([]);
    mcpMock.setCredential.mockResolvedValue('stored');
    mcpMock.deleteCredential.mockResolvedValue('deleted');
  });

  it('says nothing is required when no server signs in or reads a stored key', async () => {
    render(<MCPCredentialManager servers={[]} />);

    await waitFor(() => expect(mcpMock.listCredentialSlots).toHaveBeenCalled());
    expect(screen.getByText('No credentials required')).toBeInTheDocument();
  });

  it('saves a key for a server that reads one from the credential store', async () => {
    const user = userEvent.setup();
    mcpMock.listCredentialSlots
      .mockResolvedValueOnce([{ serverName: 'stripe', key: 'STRIPE_SECRET_KEY', stored: false }])
      .mockResolvedValue([{ serverName: 'stripe', key: 'STRIPE_SECRET_KEY', stored: true }]);

    render(<MCPCredentialManager servers={[]} />);

    const input = await screen.findByLabelText('STRIPE_SECRET_KEY');
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    await user.type(input, 'sk_test_123');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mcpMock.setCredential).toHaveBeenCalledWith(
        'stripe',
        'STRIPE_SECRET_KEY',
        'sk_test_123',
      ),
    );
    expect(await screen.findByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('removes a stored key only after the consequence is confirmed', async () => {
    const user = userEvent.setup();
    mcpMock.listCredentialSlots
      .mockResolvedValueOnce([{ serverName: 'stripe', key: 'STRIPE_SECRET_KEY', stored: true }])
      .mockResolvedValue([{ serverName: 'stripe', key: 'STRIPE_SECRET_KEY', stored: false }]);

    render(<MCPCredentialManager servers={[]} />);

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(mcpMock.deleteCredential).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('will fail to authenticate the next time it starts');
    expect(dialog).toHaveTextContent('cannot be recovered');
    await user.click(within(dialog).getByRole('button', { name: 'Remove key' }));

    await waitFor(() =>
      expect(mcpMock.deleteCredential).toHaveBeenCalledWith('stripe', 'STRIPE_SECRET_KEY'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument(),
    );
  });

  it('keeps the key and reports the failure when removal is refused', async () => {
    const user = userEvent.setup();
    mcpMock.listCredentialSlots.mockResolvedValue([
      { serverName: 'stripe', key: 'STRIPE_SECRET_KEY', stored: true },
    ]);
    mcpMock.deleteCredential.mockRejectedValue(new Error('Authentication required'));

    render(<MCPCredentialManager servers={[]} />);

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove key' }));

    expect(await screen.findByText('Authentication required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('rejects deep-link callbacks when OAuth state mismatches', async () => {
    storeOAuthState('github', 'trusted-state');

    render(<MCPCredentialManager servers={servers} />);

    await waitFor(() => expect(mcpMock.oauthStatus).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(
        new CustomEvent('agi-deep-link', {
          detail: { url: 'agiworkforce:///oauth/mcp/github?code=abc123&state=evil-state' },
        }),
      );
    });

    await waitFor(() =>
      expect(screen.getByText('OAuth state mismatch. Please try again.')).toBeInTheDocument(),
    );
    expect(mcpMock.oauthCallback).not.toHaveBeenCalled();
  });

  it('completes OAuth using the stored verified state', async () => {
    storeOAuthState('github', 'trusted-state');

    render(<MCPCredentialManager servers={servers} />);

    await waitFor(() => expect(mcpMock.oauthStatus).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(
        new CustomEvent('agi-deep-link', {
          detail: { url: 'agiworkforce:///oauth/mcp/github?code=abc123&state=trusted-state' },
        }),
      );
    });

    await waitFor(() =>
      expect(mcpMock.oauthCallback).toHaveBeenCalledWith('github', 'abc123', 'trusted-state'),
    );
    expect(sessionStorage.getItem('_csrf_github')).toBeNull();
  });
});
