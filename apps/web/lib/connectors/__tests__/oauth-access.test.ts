import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/connectors/oauth-store');
type McpDiscoveryModule = typeof import('@/lib/connectors/mcp-discovery');
type McpCustomConnectionsModule = typeof import('@/lib/connectors/mcp-custom-connections');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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
  class ConnectorGrantLockTimeoutError extends Error {
    constructor() {
      super('lock timeout');
      this.name = 'ConnectorGrantLockTimeoutError';
    }
  }
  return {
    getGrant: vi.fn(),
    updateTokens: vi.fn(),
    revokeGrant: vi.fn(),
    listRevocable: vi.fn(),
    refresh: vi.fn(),
    refreshDiscovered: vi.fn(),
    revokeDiscovered: vi.fn(),
    customClient: vi.fn(),
    record: vi.fn(),
    revokeAtProvider: vi.fn(),
    getProvider: vi.fn(),
    dbQuery: vi.fn(),
    ConnectorOAuthTokenError,
    ConnectorGrantDecryptionError,
    ConnectorGrantLockTimeoutError,
  };
});

const MockTokenError = mocks.ConnectorOAuthTokenError;
const MockDecryptionError = mocks.ConnectorGrantDecryptionError;

vi.mock('@/lib/connectors/oauth-store', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  ConnectorGrantDecryptionError: mocks.ConnectorGrantDecryptionError,
  ConnectorGrantLockTimeoutError: mocks.ConnectorGrantLockTimeoutError,
  withLockedConnectorOAuthGrant: async (
    userId: string,
    connectorId: string,
    accountKey: string,
    run: (locked: unknown) => Promise<unknown>,
  ) =>
    run({
      grant: await mocks.getGrant(userId, connectorId, accountKey),
      saveTokens: (tokens: unknown) => mocks.updateTokens(userId, connectorId, tokens, accountKey),
      revoke: () => mocks.revokeGrant(userId, connectorId, accountKey),
    }),
  getConnectorOAuthGrant: (...a: unknown[]) => mocks.getGrant(...a),
  updateConnectorOAuthGrantTokens: (...a: unknown[]) => mocks.updateTokens(...a),
  revokeConnectorOAuthGrant: (...a: unknown[]) => mocks.revokeGrant(...a),
  listRevocableConnectorTokens: (...a: unknown[]) => mocks.listRevocable(...a),
  createPendingAuthorization: vi.fn(),
  upsertConnectorOAuthGrant: vi.fn(),
}));

vi.mock('@/lib/connectors/oauth-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ConnectorOAuthTokenError: mocks.ConnectorOAuthTokenError,
  refreshAccessToken: (...a: unknown[]) => mocks.refresh(...a),
  revokeTokenAtProvider: (...a: unknown[]) => mocks.revokeAtProvider(...a),
  TOKEN_REQUEST_TIMEOUT_MS: 10_000,
}));

vi.mock('@/lib/connectors/oauth-registry', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getConnectorOAuthProvider: (...a: unknown[]) => mocks.getProvider(...a),
}));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getNeonDb: () => ({ privileged: true, query: (...a: unknown[]) => mocks.dbQuery(...a) }),
}));
vi.mock('@/lib/services/notification-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordNotification: (...a: unknown[]) => mocks.record(...a),
}));

vi.mock('@/lib/connectors/mcp-discovery', async (importOriginal) => ({
  ...(await importOriginal<McpDiscoveryModule>()),
  refreshDiscoveredGrant: mocks.refreshDiscovered,
  revokeDiscoveredGrant: mocks.revokeDiscovered,
}));

vi.mock('@/lib/connectors/mcp-custom-connections', async (importOriginal) => ({
  ...(await importOriginal<McpCustomConnectionsModule>()),
  getCustomConnectorOAuthClient: mocks.customClient,
}));

import {
  connectorUnreachableMessage,
  disconnectConnectorOAuthGrant,
  resolveConnectorAccessToken,
  revokeAllConnectorTokensAtProviders,
  vendorRevocationNotice,
} from '../oauth-access';

const PROVIDER = {
  connectorId: 'linear',
  displayName: 'Linear',
  tokenUrl: 'https://auth.example.com/token',
  mcpUrl: 'https://mcp.example.com/mcp',
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
    accountKey: 'default',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProvider.mockReturnValue(PROVIDER);
  mocks.revokeGrant.mockResolvedValue(true);
  mocks.listRevocable.mockResolvedValue([]);
  mocks.updateTokens.mockResolvedValue(undefined);
  mocks.record.mockResolvedValue({ recorded: true });
  mocks.customClient.mockResolvedValue(null);
});

function revocable(overrides: Record<string, unknown> = {}) {
  return {
    accountKey: 'default',
    token: 'live-refresh',
    tokenTypeHint: 'refresh_token',
    companionAccessToken: null,
    issuer: null,
    mcpUrl: null,
    ...overrides,
  };
}

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
      'default',
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
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear', 'default');
  });

  it('revokes the grant when the provider says invalid_grant', async () => {
    mocks.getGrant.mockResolvedValue(grant());
    mocks.refresh.mockRejectedValue(new MockTokenError('dead', 400, 'invalid_grant'));

    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toEqual({ status: 'reauthorization-required', reason: 'refresh-failed' });
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear', 'default');
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ privileged: true }),
      expect.objectContaining({
        userId: 'u1',
        category: 'connector',
        title: 'Reconnect Linear',
        target: { kind: 'settings', id: 'connectors' },
        dedupeKey: expect.stringMatching(/^connector-expired:linear:\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('tells the user nothing when the grant was already gone', async () => {
    mocks.getGrant.mockResolvedValue(grant());
    mocks.revokeGrant.mockResolvedValue(false);
    mocks.refresh.mockRejectedValue(new MockTokenError('dead', 400, 'invalid_grant'));

    await resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true });

    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('KEEPS the grant when the refresh failed transiently', async () => {
    mocks.getGrant.mockResolvedValue(grant());
    mocks.refresh.mockRejectedValue(new MockTokenError('bad gateway', 502, null));

    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toEqual({ status: 'unreachable' });
    expect(mocks.revokeGrant).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it.each([
    ['a timeout', new MockTokenError('Token endpoint auth.example.com did not answer', 504, null)],
    ['rate limiting', new MockTokenError('slow down', 429, null)],
    ['a network failure', new TypeError('fetch failed')],
  ])('reports the connector unreachable, not expired, after %s', async (_label, error) => {
    mocks.getGrant.mockResolvedValue(grant());
    mocks.refresh.mockRejectedValue(error);

    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toEqual({ status: 'unreachable' });
    expect(mocks.revokeGrant).not.toHaveBeenCalled();
  });

  it('still asks for reconnection when the provider definitively refuses the client', async () => {
    mocks.getGrant.mockResolvedValue(grant());
    mocks.refresh.mockRejectedValue(new MockTokenError('bad client', 401, 'invalid_client'));

    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toEqual({ status: 'reauthorization-required', reason: 'refresh-failed' });
  });

  it('reports the connector unreachable when another refresh holds the grant too long', async () => {
    mocks.getGrant
      .mockResolvedValueOnce(grant({ accessTokenExpiresAt: new Date(0) }))
      .mockRejectedValueOnce(new mocks.ConnectorGrantLockTimeoutError());

    await expect(resolveConnectorAccessToken('u1', 'linear')).resolves.toEqual({
      status: 'unreachable',
    });
  });

  it('reports a discovered connector unreachable when its refresh failed transiently', async () => {
    mocks.getProvider.mockReturnValue(null);
    mocks.getGrant.mockResolvedValue(
      grant({ mcpUrl: 'https://mcp.example.test/mcp', issuer: 'https://auth.example.test' }),
    );
    mocks.refreshDiscovered.mockResolvedValue({ status: 'failed', message: 'network' });

    await expect(
      resolveConnectorAccessToken('u1', 'linear', { forceRefresh: true }),
    ).resolves.toEqual({ status: 'unreachable' });
    expect(mocks.revokeGrant).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('words a transient failure as a retry, never as an expiry', () => {
    expect(connectorUnreachableMessage('Linear')).toBe(
      "Couldn't reach Linear just now. It is still connected, so try again in a moment.",
    );
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
    expect(mocks.updateTokens).toHaveBeenCalledWith('u1', 'linear', tokens, 'default');
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
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear', 'default');
    expect(mocks.updateTokens).not.toHaveBeenCalled();
  });
});

describe('disconnectConnectorOAuthGrant', () => {
  it('revokes locally even when the provider exposes no revocation endpoint', async () => {
    mocks.getProvider.mockReturnValue({ ...PROVIDER, revocationUrl: undefined });
    mocks.listRevocable.mockResolvedValue([revocable()]);

    await expect(disconnectConnectorOAuthGrant('u1', 'linear')).resolves.toEqual({
      disconnected: true,
      vendorRevocation: {
        status: 'not-revoked',
        reason: 'no-revocation-endpoint',
        manageUrl: null,
      },
    });
    expect(mocks.revokeAtProvider).not.toHaveBeenCalled();
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear', undefined);
  });

  it('revokes at the provider first, preferring the refresh token', async () => {
    mocks.getProvider.mockReturnValue({
      ...PROVIDER,
      revocationUrl: 'https://auth.example.com/revoke',
    });
    mocks.listRevocable.mockResolvedValue([revocable()]);
    mocks.revokeAtProvider.mockResolvedValue(true);

    await expect(disconnectConnectorOAuthGrant('u1', 'linear')).resolves.toEqual({
      disconnected: true,
      vendorRevocation: { status: 'revoked' },
    });

    expect(mocks.revokeAtProvider).toHaveBeenCalledWith(
      expect.anything(),
      'live-refresh',
      'refresh_token',
    );
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear', undefined);
  });

  it('hands back every connected account credential, not only the default one', async () => {
    mocks.getProvider.mockReturnValue({
      ...PROVIDER,
      revocationUrl: 'https://auth.example.com/revoke',
    });
    mocks.listRevocable.mockResolvedValue([
      revocable({ accountKey: 'work', token: 'work-refresh' }),
      revocable({
        accountKey: 'personal',
        token: 'personal-access',
        tokenTypeHint: 'access_token',
      }),
    ]);
    mocks.revokeAtProvider.mockResolvedValue(true);

    await disconnectConnectorOAuthGrant('u1', 'linear');

    expect(mocks.listRevocable).toHaveBeenCalledWith('u1', 'linear', undefined);
    expect(mocks.revokeAtProvider.mock.calls.map((call) => call[1])).toEqual([
      'work-refresh',
      'personal-access',
    ]);
  });

  it('revokes only the named account when one is given', async () => {
    mocks.getProvider.mockReturnValue({
      ...PROVIDER,
      revocationUrl: 'https://auth.example.com/revoke',
    });
    mocks.listRevocable.mockResolvedValue([
      revocable({ accountKey: 'work', token: 'work-refresh' }),
    ]);
    mocks.revokeAtProvider.mockResolvedValue(true);

    await disconnectConnectorOAuthGrant('u1', 'linear', 'work');

    expect(mocks.listRevocable).toHaveBeenCalledWith('u1', 'linear', 'work');
    expect(mocks.revokeAtProvider).toHaveBeenCalledTimes(1);
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear', 'work');
  });

  it('still revokes locally when provider revocation throws', async () => {
    mocks.getProvider.mockReturnValue({
      ...PROVIDER,
      revocationUrl: 'https://auth.example.com/revoke',
    });
    mocks.listRevocable.mockRejectedValue(new Error('database down'));

    await expect(disconnectConnectorOAuthGrant('u1', 'linear')).resolves.toEqual({
      disconnected: true,
      vendorRevocation: { status: 'not-revoked', reason: 'failed', manageUrl: null },
    });
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear', undefined);
  });

  it('reports a provider that refused the revocation', async () => {
    mocks.getProvider.mockReturnValue({
      ...PROVIDER,
      revocationUrl: 'https://auth.example.com/revoke',
    });
    mocks.listRevocable.mockResolvedValue([revocable()]);
    mocks.revokeAtProvider.mockResolvedValue(false);

    const outcome = await disconnectConnectorOAuthGrant('u1', 'linear');

    expect(outcome.vendorRevocation).toEqual({
      status: 'not-revoked',
      reason: 'failed',
      manageUrl: null,
    });
    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'linear', undefined);
  });

  it('has nothing to report when no credential was held', async () => {
    mocks.listRevocable.mockResolvedValue([]);

    await expect(disconnectConnectorOAuthGrant('u1', 'linear')).resolves.toEqual({
      disconnected: true,
      vendorRevocation: { status: 'nothing-to-revoke' },
    });
  });

  describe('a directory or custom MCP grant', () => {
    const discovered = revocable({
      token: 'vendor-refresh',
      companionAccessToken: 'vendor-access',
      issuer: 'https://auth.vendor.test',
      mcpUrl: 'https://mcp.vendor.test/mcp',
    });

    beforeEach(() => {
      mocks.getProvider.mockReturnValue(null);
      mocks.listRevocable.mockResolvedValue([discovered]);
    });

    it('revokes the refresh and access tokens at the issuer before deleting its own copy', async () => {
      const order: string[] = [];
      mocks.revokeDiscovered.mockImplementation(async () => {
        order.push('vendor');
        return { status: 'revoked' };
      });
      mocks.revokeGrant.mockImplementation(async () => {
        order.push('local');
        return true;
      });
      mocks.customClient.mockResolvedValue({ clientId: 'own-client', clientSecret: 'own-secret' });

      await expect(disconnectConnectorOAuthGrant('u1', 'custom:abc')).resolves.toEqual({
        disconnected: true,
        vendorRevocation: { status: 'revoked' },
      });
      expect(mocks.revokeDiscovered).toHaveBeenCalledWith({
        issuer: 'https://auth.vendor.test',
        client: { clientId: 'own-client', clientSecret: 'own-secret' },
        tokens: [
          { token: 'vendor-refresh', tokenTypeHint: 'refresh_token' },
          { token: 'vendor-access', tokenTypeHint: 'access_token' },
        ],
      });
      expect(mocks.customClient).toHaveBeenCalledWith('u1', 'custom:abc');
      expect(order).toEqual(['vendor', 'local']);
      expect(mocks.revokeAtProvider).not.toHaveBeenCalled();
    });

    it('deletes its copy and names where to remove access when the issuer offers no revocation', async () => {
      mocks.revokeDiscovered.mockResolvedValue({
        status: 'unsupported',
        manageUrl: 'https://vendor.test/settings/apps',
      });

      const outcome = await disconnectConnectorOAuthGrant('u1', 'dir-record');

      expect(outcome).toEqual({
        disconnected: true,
        vendorRevocation: {
          status: 'not-revoked',
          reason: 'no-revocation-endpoint',
          manageUrl: 'https://vendor.test/settings/apps',
        },
      });
      expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'dir-record', undefined);
      expect(vendorRevocationNotice('Vendor', outcome.vendorRevocation)).toBe(
        'Disconnected here, but access was not revoked at Vendor, so access may remain until ' +
          'you remove it at https://vendor.test/settings/apps.',
      );
    });

    it('deletes its copy and says access may remain when the revocation fails', async () => {
      mocks.revokeDiscovered.mockResolvedValue({ status: 'failed', manageUrl: null });

      const outcome = await disconnectConnectorOAuthGrant('u1', 'dir-record');

      expect(outcome.disconnected).toBe(true);
      expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'dir-record', undefined);
      expect(vendorRevocationNotice('Vendor', outcome.vendorRevocation)).toBe(
        'Disconnected here, but Vendor did not confirm that it revoked access, so access may ' +
          'remain until you remove it in your Vendor account settings.',
      );
    });
  });
});

describe('revokeAllConnectorTokensAtProviders', () => {
  const google = { revocationUrl: 'https://oauth2.googleapis.com/revoke' };

  beforeEach(() => {
    mocks.dbQuery.mockReset();
    mocks.listRevocable.mockReset();
    mocks.revokeAtProvider.mockReset();
    mocks.getProvider.mockReset();
  });

  it('revokes every account of every connector that has a revocation endpoint', async () => {
    mocks.dbQuery.mockResolvedValue([{ connector_id: 'gmail' }, { connector_id: 'no-revoke' }]);
    mocks.getProvider.mockImplementation((id: string) => (id === 'gmail' ? google : {}));
    mocks.listRevocable.mockResolvedValue([
      revocable({ token: 'r1' }),
      revocable({ accountKey: 'work', token: 'r2' }),
    ]);
    mocks.revokeAtProvider.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(revokeAllConnectorTokensAtProviders('u1')).resolves.toEqual({
      attempted: 2,
      revoked: 1,
    });
    expect(mocks.listRevocable).toHaveBeenCalledWith('u1', 'gmail');
    expect(mocks.revokeAtProvider).toHaveBeenCalledTimes(2);
    expect(mocks.revokeAtProvider).toHaveBeenCalledWith(google, 'r2', 'refresh_token');
  });

  it('revokes directory and custom MCP grants at their issuer on erasure', async () => {
    mocks.dbQuery.mockResolvedValue([{ connector_id: 'custom:abc' }]);
    mocks.getProvider.mockReturnValue(null);
    mocks.customClient.mockResolvedValue(null);
    mocks.listRevocable.mockResolvedValue([
      revocable({ issuer: 'https://auth.vendor.test', mcpUrl: 'https://mcp.vendor.test/mcp' }),
    ]);
    mocks.revokeDiscovered.mockResolvedValue({ status: 'revoked' });

    await expect(revokeAllConnectorTokensAtProviders('u1')).resolves.toEqual({
      attempted: 1,
      revoked: 1,
    });
    expect(mocks.revokeDiscovered).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: 'https://auth.vendor.test' }),
    );
  });

  it('never throws when the grants cannot be read or a token cannot be listed', async () => {
    mocks.dbQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(revokeAllConnectorTokensAtProviders('u1')).resolves.toEqual({
      attempted: 0,
      revoked: 0,
    });

    mocks.dbQuery.mockResolvedValue([{ connector_id: 'gmail' }]);
    mocks.getProvider.mockReturnValue(google);
    mocks.listRevocable.mockRejectedValue(new MockDecryptionError());
    await expect(revokeAllConnectorTokensAtProviders('u1')).resolves.toEqual({
      attempted: 0,
      revoked: 0,
    });
  });
});
