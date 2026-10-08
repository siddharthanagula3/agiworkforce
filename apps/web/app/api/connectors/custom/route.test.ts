import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type OAuthAccessModule = typeof import('@/lib/connectors/oauth-access');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  getSubscription: vi.fn(),
  connect: vi.fn(),
  summaries: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
  directoryByUrl: vi.fn(async (..._args: unknown[]) => null as unknown),
  disconnect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mocks.query(...args) })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.execute?.(...args),
    },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mocks.getSubscription },
}));
vi.mock('@/lib/mcp-url-validation', () => ({
  validateHttpsMcpUrl: vi.fn(async () => new URL('https://mcp.example.com/sse')),
}));
vi.mock('@/lib/custom-connector-crypto', () => ({
  encryptConnectorToken: vi.fn(() => 'enc'),
  decryptConnectorToken: vi.fn(),
  bearerCredential: vi.fn((token: string) => ({
    headerName: 'Authorization',
    headerValue: `Bearer ${token}`,
  })),
  sealCustomConnectorCredential: vi.fn(() => 'enc'),
  openCustomConnectorCredential: vi.fn(),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  evictCustomConnectorCaches: vi.fn(),
  getUserCustomConnectorSummaries: (...args: unknown[]) => mocks.summaries(...args),
}));
vi.mock('@/lib/connectors/mcp-directory-targets', () => ({
  isDirectoryServerId: vi.fn(() => false),
  normalizeRemoteUrl: vi.fn((url: string) => url),
  resolveDirectoryTarget: vi.fn(async () => null),
  findDirectoryTargetByRemoteUrl: (...args: unknown[]) => mocks.directoryByUrl(...args),
}));
vi.mock('@/lib/connectors/mcp-discovery', () => ({
  mcpServerPublishesProtectedResource: vi.fn(async () => false),
  refreshDiscoveredGrant: vi.fn(),
  revokeDiscoveredGrant: vi.fn(),
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  ConnectorGrantDecryptionError: class extends Error {},
  ConnectorGrantLockTimeoutError: class extends Error {},
  createPendingAuthorization: vi.fn(),
  getConnectorOAuthGrant: vi.fn(async () => null),
  getUserConnectorOAuthGrantSummaries: vi.fn(async () => []),
  listRevocableConnectorTokens: vi.fn(async () => []),
  revokeConnectorOAuthGrant: vi.fn(async () => true),
  upsertConnectorOAuthGrant: vi.fn(),
  withLockedConnectorOAuthGrant: vi.fn(),
}));
vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<OAuthAccessModule>()),
  disconnectConnectorOAuthGrant: (...args: unknown[]) => mocks.disconnect(...args),
  resolveConnectorAccessToken: vi.fn(async () => ({ status: 'not-connected' })),
}));
vi.mock('@/lib/connectors/mcp-client-metadata', () => ({
  resolveClientRedirectUri: vi.fn(() => null),
}));
vi.mock('@/lib/connectors/mcp-runtime-cache', () => ({
  getMcpStatelessRuntime: vi.fn(async () => ({})),
  mcpAuthorizationContext: {
    userOauthConnector: (userId: string, connectorId: string) =>
      `user:${userId}:oauth:${connectorId}`,
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@agiworkforce/mcp', () => ({ connectMcpServer: mocks.connect }));

import { DELETE, GET, POST } from './route';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';

function request() {
  return new NextRequest('http://localhost/api/connectors/custom', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'My MCP', url: 'https://mcp.example.com/sse' }),
  });
}

describe('POST /api/connectors/custom free-plan entitlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSubscription.mockResolvedValue({ plan_tier: 'free' });
    mocks.connect.mockResolvedValue({
      protocolEra: 'modern',
      catalog: {
        tools: [{ toolName: 'search', visibility: 'model' }],
        resources: [],
        resourceTemplates: [],
        prompts: [],
        apps: [],
      },
      close: vi.fn(),
    });
  });

  it('rejects a second custom remote MCP for a free user before network work', async () => {
    // Routed by SQL: the connector policy gate resolves the caller's workspace
    // before the entitlement count runs, so a queued single response would be
    // answered to the wrong query.
    mocks.query.mockImplementation(async (sql: string) =>
      String(sql).includes('user_custom_connectors') ? [{ count: '1' }] : [],
    );

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect((await response.json()).error.message).toContain('1 custom connector');
  });

  it('uses the Pro plan limit from the shared billing catalog', async () => {
    mocks.getSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
    mocks.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('user_custom_connectors')) return [{ count: '1' }];
      if (text.includes('assert_user_resource_limit')) {
        return [
          {
            id: 'connector-1',
            short_id: 'abc123',
            name: 'My MCP',
            url: 'https://mcp.example.com/sse',
            transport: 'sse',
            created_at: '2026-07-17T00:00:00.000Z',
            updated_at: '2026-07-17T00:00:00.000Z',
          },
        ];
      }
      return [];
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    const insert = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes("assert_user_resource_limit('custom_connectors'"),
    ) as [string, unknown[]] | undefined;
    expect(insert, 'the insert must assert the plan limit').toBeDefined();
    expect(insert![1]).toContain(getCustomRemoteMcpLimit('pro'));
  });

  it.each([
    ['an unrecognised tier', { plan_tier: 'starter', status: 'active' }],
    ['a lapsed Pro subscription', { plan_tier: 'pro', status: 'canceled' }],
  ])('holds %s to the Free connector limit before network work', async (_label, subscription) => {
    mocks.getSubscription.mockResolvedValue(subscription);
    mocks.query.mockImplementation(async (sql: string) =>
      String(sql).includes('user_custom_connectors')
        ? [{ count: String(getCustomRemoteMcpLimit('free')) }]
        : [],
    );

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect((await response.json()).error.message).toContain('1 custom connector');
  });
});

describe('GET /api/connectors/custom directory linkage', () => {
  const ROW = {
    id: 'row-1',
    shortId: 'abc123',
    name: 'Sentry',
    url: 'https://mcp.sentry.dev/mcp',
    transport: 'streamable-http',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  function listRequest() {
    return new NextRequest('http://localhost/api/connectors/custom');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.summaries.mockResolvedValue([ROW]);
  });

  it('names the directory entry a linked row came from', async () => {
    mocks.directoryByUrl.mockResolvedValue({ connectorId: 'io.sentry/mcp' });

    const body = (await (await GET(listRequest())).json()) as {
      connectors: { id: string; directoryId?: string }[];
    };

    expect(mocks.directoryByUrl).toHaveBeenCalledWith(ROW.url);
    expect(body.connectors).toEqual([{ ...ROW, signedIn: false, directoryId: 'io.sentry/mcp' }]);
  });

  it('leaves a hand-entered endpoint unlinked', async () => {
    mocks.directoryByUrl.mockResolvedValue(null);

    const body = (await (await GET(listRequest())).json()) as {
      connectors: { directoryId?: string }[];
    };

    expect(body.connectors).toEqual([{ ...ROW, signedIn: false }]);
    expect(body.connectors[0]).not.toHaveProperty('directoryId');
  });
});

describe('DELETE /api/connectors/custom vendor revocation', () => {
  const STORED = { id: 'row-1', short_id: 'abc123', name: 'Sentry' };
  let order: string[];

  function deleteRequest() {
    return new NextRequest('http://localhost/api/connectors/custom?id=row-1', {
      method: 'DELETE',
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    order = [];
    mocks.query.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('select id, short_id, name from user_custom_connectors')) {
        return [STORED];
      }
      if (text.startsWith('delete from user_custom_connectors')) {
        order.push('row deleted');
        return [{ id: STORED.id, short_id: STORED.short_id }];
      }
      return [];
    });
  });

  it('hands the grant back to the vendor while the row still holds its client', async () => {
    mocks.disconnect.mockImplementation(async () => {
      order.push('vendor revoked');
      return { disconnected: true, vendorRevocation: { status: 'revoked' } };
    });

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.disconnect).toHaveBeenCalledWith('user-1', 'custom-abc123');
    expect(order).toEqual(['vendor revoked', 'row deleted']);
  });

  it('tells the user access may remain at the vendor when it was not revoked', async () => {
    mocks.disconnect.mockResolvedValue({
      disconnected: true,
      vendorRevocation: {
        status: 'not-revoked',
        reason: 'no-revocation-endpoint',
        manageUrl: 'https://sentry.example/settings/apps',
      },
    });

    const response = await DELETE(deleteRequest());

    expect(await response.json()).toEqual({
      success: true,
      vendorNotice:
        'Disconnected here, but access was not revoked at Sentry, so access may remain until ' +
        'you remove it at https://sentry.example/settings/apps.',
    });
    expect(order).toEqual(['row deleted']);
  });
});
