import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import MCPCredentialManager from '../MCPCredentialManager';
import type {
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
  },
}));

vi.mock('../../../stores/mcpStore', () => ({
  useMcpStore: () => ({
    storeCredential: vi.fn(),
  }),
}));

interface McpClientMocks {
  oauthStatus: Mock<(provider: string) => Promise<McpOAuthConnectionStatus>>;
  oauthCallback: Mock<
    (provider: string, code: string, callbackState: string) => Promise<McpOAuthTokenResponse>
  >;
  oauthStart: Mock;
  oauthDisconnect: Mock;
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
    tool_count: 0,
  },
];

describe('MCPCredentialManager', () => {
  let mcpMock: McpClientMocks;

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
  });

  it('rejects deep-link callbacks when OAuth state mismatches', async () => {
    sessionStorage.setItem('oauth_state_github', 'trusted-state');

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
    sessionStorage.setItem('oauth_state_github', 'trusted-state');

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
    expect(sessionStorage.getItem('oauth_state_github')).toBeNull();
  });
});
