import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => {
  class ConnectorOAuthTokenError extends Error {
    readonly status: number;
    readonly oauthError: string | null;
    constructor(message: string, status: number, oauthError: string | null) {
      super(message);
      this.name = 'ConnectorOAuthTokenError';
      this.status = status;
      this.oauthError = oauthError;
    }
    get isInvalidGrant(): boolean {
      return this.oauthError === 'invalid_grant';
    }
  }
  class ConnectorGrantDecryptionError extends Error {
    constructor() {
      super('undecryptable');
      this.name = 'ConnectorGrantDecryptionError';
    }
  }
  return {
    getGrant: vi.fn(),
    updateTokens: vi.fn(),
    revokeGrant: vi.fn(),
    refresh: vi.fn(),
    refreshDiscovered: vi.fn(),
    revokeAtProvider: vi.fn(),
    getProvider: vi.fn(),
    ConnectorOAuthTokenError,
    ConnectorGrantDecryptionError,
  };
});

const MockTokenError = mocks.ConnectorOAuthTokenError;
const MockDecryptionError = mocks.ConnectorGrantDecryptionError;

vi.mock('@/lib/connectors/oauth-store', () => ({
  ConnectorGrantDecryptionError: mocks.ConnectorGrantDecryptionError,
  getConnectorOAuthGrant: (...a: unknown[]) => mocks.getGrant(...a),
  updateConnectorOAuthGrantTokens: (...a: unknown[]) => mocks.updateTokens(...a),
  revokeConnectorOAuthGrant: (...a: unknown[]) => mocks.revokeGrant(...a),
  createPendingAuthorization: vi.fn(),
  upsertConnectorOAuthGrant: vi.fn(),
}));

vi.mock('@/lib/connectors/oauth-client', () => ({
  ConnectorOAuthTokenError: mocks.ConnectorOAuthTokenError,
  refreshAccessToken: (...a: unknown[]) => mocks.refresh(...a),
  revokeTokenAtProvider: (...a: unknown[]) => mocks.revokeAtProvider(...a),
}));

vi.mock('@/lib/connectors/oauth-registry', () => ({
  getConnectorOAuthProvider: (...a: unknown[]) => mocks.getProvider(...a),
}));

vi.mock('@/lib/connectors/mcp-discovery', () => ({
  refreshDiscoveredGrant: mocks.refreshDiscovered,
}));

import { disconnectConnectorOAuthGrant, resolveConnectorAccessToken } from '../oauth-access';

const PROVIDER = {
  connectorId: 'linear',
  tokenUrl: 'https://auth.example.com/token',
  revocationUrl: undefined as string | undefined,
};

function grant(overrides: Record<string, unknown> = {}) {
  return {
    connectorId: 'linear',
    accessToken: 'live-access',
    refreshToken: 'live-refresh',
    tokenType: 'Bearer',
    grantedScopes: ['read'],
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    tokenEndpoint: 'https://auth.example.com/token',
    connectedAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProvider.mockReturnValue(PROVIDER);
  mocks.revokeGrant.mockResolvedValue(true);
  mocks.updateTokens.mockResolvedValue(undefined);
});

describe('resolveConnectorAccessToken', () => {
  it('reports not-configured when there is neither an OAuth app nor an MCP endpoint', async () => {
    mocks.getProvider.mockReturnValue(null);
    await expect(resolveConnectorAccessToken('u1', 'salesforce')).resolves.toEqual({
      status: 'not-configured',
    });
    expect(mocks.getGrant).not.toHaveBeenCalled();
  });

  it('looks for a grant when the connector has a discoverable MCP endpoint', async () => {
    mocks.getProvider.mockReturnValue(null);
    mocks.getGrant.mockResolvedValue(null);
    await expect(resolveConnectorAccessToken('u1', 'linear')).resolves.toEqual({
      status: 'not-connected',
    });
    expect(mocks.getGrant).toHaveBeenCalled();
  });

  it('reports not-connected when the user never authorized', async () => {
    mocks.getGrant.mockResolvedValue(null);
    await expect(resolveConnectorAccessToken('u1', 'linear')).resolves.toEqual({
      status: 'not-connected',
    });
  });

  it('returns a live token without touching the token endpoint', async () => {
    mocks.getGrant.mockResolvedValue(grant());
    await expect(resolveConnectorAccessToken('u1', 'linear')).resolves.toMatchObject({
      status: 'ready',
      accessToken: 'live-access',
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('refreshes a token inside the expiry skew and persists the result', async () => {
    mocks.getGrant.mockResolvedValue(grant({ accessTokenExpiresAt: new Date(Date.now() + 5_000) }));
    mocks.refresh.mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
      tokenType: 'Bearer',
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      grantedScopes: ['read'],
    });

    await expect(resolveConnectorAccessToken('u1', 'linear')).resolves.toMatchObject({
      status: 'ready',
      accessToken: 'fresh-access',
    });
    expect(mocks.updateTokens).toHaveBeenCalledWith(
      'u1',
      'linear',
      expect.objectContaining({ accessToken: 'fresh-access' }),
    );
  });

  it('forces a refresh after a 401 even when the token looks unexpired', async () => {
    mocks.getGrant.mockResolvedValue(grant());
    mocks.refresh.mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: null,
      tokenType: 'Bearer',
      accessTokenExpiresAt: null,
      grantedScopes: ['read'],
    });

    const result = await resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true });

    expect(result).toMatchObject({ status: 'ready', accessToken: 'fresh-access' });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('revokes the grant when there is nothing to refresh with', async () => {
    mocks.getGrant.mockResolvedValue(grant({ refreshToken: null }));

    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toEqual({ status: 'reauthorization-required', reason: 'expired' });
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear');
  });

  it('revokes the grant when the provider says invalid_grant', async () => {
    mocks.getGrant.mockResolvedValue(grant());
    mocks.refresh.mockRejectedValue(new MockTokenError('dead', 400, 'invalid_grant'));

    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toEqual({ status: 'reauthorization-required', reason: 'refresh-failed' });
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear');
  });

  it('KEEPS the grant when the refresh failed transiently', async () => {
    mocks.getGrant.mockResolvedValue(grant());
    mocks.refresh.mockRejectedValue(new MockTokenError('bad gateway', 502, null));

    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toEqual({ status: 'reauthorization-required', reason: 'refresh-failed' });
    expect(mocks.revokeGrant).not.toHaveBeenCalled();
  });

  it('asks for reconnection when the stored ciphertext cannot be decrypted', async () => {
    mocks.getGrant.mockRejectedValue(new MockDecryptionError());

    await expect(resolveConnectorAccessToken('u1', 'linear')).resolves.toEqual({
      status: 'reauthorization-required',
      reason: 'undecryptable',
    });
  });

  it('refreshes a self-service grant without operator OAuth configuration', async () => {
    mocks.getProvider.mockReturnValue(null);
    mocks.getGrant.mockResolvedValue(
      grant({
        mcpUrl: 'https://mcp.example.test/mcp',
        issuer: 'https://auth.example.test',
      }),
    );
    const tokens = {
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    };
    mocks.refreshDiscovered.mockResolvedValue({ status: 'refreshed', ...tokens });
    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toMatchObject({
      status: 'ready',
      accessToken: 'fresh-access',
    });
    expect(mocks.refreshDiscovered).toHaveBeenCalledWith({
      mcpUrl: 'https://mcp.example.test/mcp',
      issuer: 'https://auth.example.test',
      refreshToken: 'live-refresh',
      tokenType: 'Bearer',
      grantedScopes: ['read'],
    });
    expect(mocks.updateTokens).toHaveBeenCalledWith('u1', 'linear', tokens);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('revokes a discovered grant when the authorization server changes', async () => {
    mocks.getProvider.mockReturnValue(null);
    mocks.getGrant.mockResolvedValue(
      grant({
        mcpUrl: 'https://mcp.example.test/mcp',
        issuer: 'https://auth.example.test',
      }),
    );
    mocks.refreshDiscovered.mockResolvedValue({ status: 'authorization-server-changed' });
    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toEqual({
      status: 'reauthorization-required',
      reason: 'refresh-failed',
    });
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear');
    expect(mocks.updateTokens).not.toHaveBeenCalled();
  });
});

describe('disconnectConnectorOAuthGrant', () => {
  it('revokes locally even when the provider exposes no revocation endpoint', async () => {
    mocks.getProvider.mockReturnValue({ ...PROVIDER, revocationUrl: undefined });

    await expect(disconnectConnectorOAuthGrant('u1', 'linear')).resolves.toBe(true);
    expect(mocks.revokeAtProvider).not.toHaveBeenCalled();
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear');
  });

  it('revokes at the provider first, preferring the refresh token', async () => {
    mocks.getProvider.mockReturnValue({
      ...PROVIDER,
      revocationUrl: 'https://auth.example.com/revoke',
    });
    mocks.getGrant.mockResolvedValue(grant());
    mocks.revokeAtProvider.mockResolvedValue(true);

    await disconnectConnectorOAuthGrant('u1', 'linear');

    expect(mocks.revokeAtProvider).toHaveBeenCalledWith(
      expect.anything(),
      'live-refresh',
      'refresh_token',
    );
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear');
  });

  it('still revokes locally when provider revocation throws', async () => {
    mocks.getProvider.mockReturnValue({
      ...PROVIDER,
      revocationUrl: 'https://auth.example.com/revoke',
    });
    mocks.getGrant.mockRejectedValue(new Error('database down'));

    await expect(disconnectConnectorOAuthGrant('u1', 'linear')).resolves.toBe(true);
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear');
  });
});
