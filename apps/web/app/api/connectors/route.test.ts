import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  githubInstallations: vi.fn(),
  customConnectors: vi.fn(),
  operatorIds: new Set(['slack']),
  linkingAvailable: vi.fn(() => false),
  oauthConfiguredIds: vi.fn(() => new Set<string>()),
  oauthGrants: vi.fn(),
  disconnectOauth: vi.fn(),
  evictOauthCaches: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  getOperatorMappedConnectorIds: vi.fn(() => mocks.operatorIds),
  getUserGithubInstallations: (...args: unknown[]) => mocks.githubInstallations(...args),
  getUserCustomConnectorSummaries: (...args: unknown[]) => mocks.customConnectors(...args),
  evictConnectorOAuthCaches: (...args: unknown[]) => mocks.evictOauthCaches(...args),
}));
vi.mock('@/lib/connectors/oauth-registry', () => ({
  getOAuthConfiguredConnectorIds: () => mocks.oauthConfiguredIds(),
  isConnectorOAuthConfigured: (id: string) => mocks.oauthConfiguredIds().has(id),
  buildConnectorOAuthStartPath: (id: string) => `/api/connectors/oauth/start?connectorId=${id}`,
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  getUserConnectorOAuthGrantSummaries: (...args: unknown[]) => mocks.oauthGrants(...args),
}));
vi.mock('@/lib/connectors/oauth-access', () => ({
  disconnectConnectorOAuthGrant: (...args: unknown[]) => mocks.disconnectOauth(...args),
}));
vi.mock('@/lib/github-app', () => ({
  getGitHubAppInstallUrl: vi.fn(() => 'https://github.com/apps/agi/installations/new'),
  isGitHubAppConfigured: vi.fn(() => true),
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { CONNECTORS } from '@/features/connectors/data/connectors';
import { CONNECTOR_CAPABILITIES } from '@/lib/connectors/catalog';

import { DELETE, GET, POST } from './route';

function getRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/connectors');
}

function postRequest(connectorId: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/connectors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectorId, authType: 'local' }),
  });
}

describe('/api/connectors managed-cloud capability boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
    mocks.execute.mockResolvedValue(undefined);
    mocks.githubInstallations.mockResolvedValue([]);
    mocks.customConnectors.mockResolvedValue([]);
    mocks.linkingAvailable.mockReturnValue(false);
    mocks.oauthConfiguredIds.mockReturnValue(new Set<string>());
    mocks.oauthGrants.mockResolvedValue([]);
    mocks.disconnectOauth.mockResolvedValue(false);
    mocks.evictOauthCaches.mockResolvedValue(undefined);
  });

  it('does not advertise or restore device-local connector rows in Cloud mode', async () => {
    mocks.query.mockResolvedValue([
      {
        id: 'row-local',
        connector_id: 'local-filesystem',
        auth_type: 'local',
        connected_at: '2026-07-23T00:00:00.000Z',
        updated_at: '2026-07-23T00:00:00.000Z',
      },
      {
        id: 'row-remote',
        connector_id: 'slack',
        auth_type: 'oauth',
        connected_at: '2026-07-23T00:00:00.000Z',
        updated_at: '2026-07-23T00:00:00.000Z',
      },
    ]);

    const response = await GET(getRequest());
    const body = (await response.json()) as {
      connectors: Array<{ connectorId: string }>;
      available: string[];
    };

    expect(response.status).toBe(200);
    expect(body.connectors.map((connector) => connector.connectorId)).toEqual(['slack']);
    expect(body.available).toContain('slack');
    expect(body.available).not.toContain('github');
    expect(body.available).not.toContain('local-filesystem');
  });

  it('rejects a device-local connector before any Cloud persistence', async () => {
    const response = await POST(postRequest('local-filesystem'));

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      connectorId: 'local-filesystem',
      error: expect.stringContaining('Desktop Local settings'),
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('accepts dropbox as a known connector id (honest 501, not the allowlist rejection)', async () => {
    // dropbox is in VALID_CONNECTOR_IDS but (like most providers here) isn't
    // operator-mapped in this test's mock, so it must fail with the "not
    // implemented for this provider" 501 — NOT the "Invalid connector ID" 400
    // an unlisted id would get. This is the regression check for dropbox
    // joining the allowlist alongside onedrive.
    const response = await POST(postRequest('dropbox'));

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      connectorId: 'dropbox',
      error: expect.stringContaining('not implemented for this provider'),
    });
  });

  it('does not start GitHub installation while user ownership proof is unavailable', async () => {
    const response = await POST(postRequest('github'));
    const body = (await response.json()) as {
      error: string;
      installStartPath?: string;
    };

    expect(response.status).toBe(501);
    expect(body.error).toContain('ownership');
    expect(body.installStartPath).toBeUndefined();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('advertises and starts GitHub only when the complete ownership flow is configured', async () => {
    mocks.linkingAvailable.mockReturnValue(true);

    const getResponse = await GET(getRequest());
    const getBody = (await getResponse.json()) as { available: string[] };
    expect(getBody.available).toContain('github');

    const postResponse = await POST(postRequest('github'));
    expect(postResponse.status).toBe(409);
    await expect(postResponse.json()).resolves.toMatchObject({
      connectorId: 'github',
      installStartPath: '/api/github/install/start',
    });
  });

  it('advertises a provider as soon as an operator registers its OAuth app', async () => {
    // This is the "Coming soon" fix: availability is computed from real
    // capability, and an OAuth-configured provider is real capability.
    mocks.oauthConfiguredIds.mockReturnValue(new Set(['linear']));

    const response = await GET(getRequest());
    const body = (await response.json()) as { available: string[] };

    expect(body.available).toContain('linear');
  });

  it('sends an OAuth provider through the authorization flow, not a directory toggle', async () => {
    mocks.oauthConfiguredIds.mockReturnValue(new Set(['linear']));

    const response = await POST(postRequest('linear'));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      connectorId: 'linear',
      oauthStartPath: '/api/connectors/oauth/start?connectorId=linear',
      // Alias the existing web directory hook already follows on a 409, so a
      // configured OAuth connector opens consent instead of toasting an error.
      installStartPath: '/api/connectors/oauth/start?connectorId=linear',
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('starts the OAuth flow for a configured provider outside VALID_CONNECTOR_IDS', async () => {
    // `airtable` is in the web catalog (features/connectors/data/connectors.ts)
    // but NOT in this route's 34-id VALID_CONNECTOR_IDS allowlist, and the OAuth
    // registry accepts any well-formed connectorId. Before the POST gate learned
    // about OAuth-configured ids, GET advertised airtable as available — so the
    // directory rendered a live Connect button — and this POST answered 400
    // "Invalid connector ID". Availability and connectability must agree.
    mocks.oauthConfiguredIds.mockReturnValue(new Set(['airtable']));

    const getBody = (await (await GET(getRequest())).json()) as { available: string[] };
    expect(getBody.available).toContain('airtable');

    const response = await POST(postRequest('airtable'));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      connectorId: 'airtable',
      oauthStartPath: '/api/connectors/oauth/start?connectorId=airtable',
    });
    // The 409 is a redirect to consent, not a connection: nothing is persisted.
    expect(
      mocks.query.mock.calls.some(([sql]) => String(sql).includes('insert into user_connectors')),
    ).toBe(false);
  });

  it('never rejects a connector the directory itself lists (audit CRIT-001)', async () => {
    // The route used to carry its own `VALID_CONNECTOR_IDS` set of 34 ids while
    // the directory rendered 89. Every id in the gap answered 400 "Invalid
    // connector ID" — a message about a connector the product had just shown
    // the user — instead of the honest "not implemented for this provider".
    // Both lists are now the canonical registry, so this asserts the gap is
    // closed for every catalog entry rather than for one sampled id.
    const rejected: string[] = [];
    for (const connector of CONNECTORS) {
      const response = await POST(postRequest(connector.id));
      if (response.status === 400) rejected.push(connector.id);
    }
    expect(rejected).toEqual([]);
  });

  it('answers an unbuilt connector honestly instead of pretending it saved', async () => {
    // trello: no remote MCP endpoint, not operator-mapped, no OAuth app. This
    // used to be airtable, but 2f4cebaf4 gave airtable a self-service MCP
    // endpoint, so it now takes the authorization branch below rather than
    // this one — see the next test.
    const response = await POST(postRequest('trello'));

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({ connectorId: 'trello' });
    expect(
      mocks.query.mock.calls.some(([sql]) => String(sql).includes('insert into user_connectors')),
    ).toBe(false);
  });

  it('sends a self-service MCP connector to authorization rather than saving a row', async () => {
    // airtable has a remote MCP endpoint with `clientRegistration: 'cimd'`, so
    // it connects by running the authorization flow, not by flipping a row.
    // The honest answer is 409 + where to send the user — and, exactly as for
    // the unbuilt case above, still no insert.
    const response = await POST(postRequest('airtable'));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      connectorId: 'airtable',
      oauthStartPath: expect.stringContaining('connectorId=airtable'),
    });
    expect(
      mocks.query.mock.calls.some(([sql]) => String(sql).includes('insert into user_connectors')),
    ).toBe(false);
  });

  it('refuses an id the canonical registry has never heard of', async () => {
    const response = await POST(postRequest('totally-made-up'));

    expect(response.status).toBe(400);
    expect(CONNECTOR_CAPABILITIES['totally-made-up']).toBeUndefined();
  });

  it('reports resolved health with each connector, not raw flags to recombine', async () => {
    mocks.oauthConfiguredIds.mockReturnValue(new Set(['linear']));
    mocks.oauthGrants.mockResolvedValue([
      {
        connectorId: 'linear',
        grantedScopes: ['read'],
        connectedAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        needsReauthorization: true,
      },
    ]);

    const body = (await (await GET(getRequest())).json()) as {
      connectors: Array<{ connectorId: string; health?: string }>;
    };

    expect(body.connectors.find((c) => c.connectorId === 'linear')?.health).toBe(
      'needs-reauthorization',
    );
  });

  it('reports an OAuth grant as connected, without exposing any token material', async () => {
    mocks.oauthConfiguredIds.mockReturnValue(new Set(['linear']));
    mocks.oauthGrants.mockResolvedValue([
      {
        connectorId: 'linear',
        grantedScopes: ['read'],
        connectedAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        needsReauthorization: false,
      },
    ]);

    const response = await GET(getRequest());
    const body = (await response.json()) as {
      connectors: Array<{ connectorId: string; source: string; scopes?: string[] }>;
    };

    const entry = body.connectors.find((c) => c.connectorId === 'linear');
    expect(entry).toMatchObject({ source: 'oauth', scopes: ['read'] });
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });

  it('does not report a grant whose provider is no longer configured', async () => {
    mocks.oauthGrants.mockResolvedValue([
      {
        connectorId: 'linear',
        grantedScopes: [],
        connectedAt: '',
        updatedAt: '',
        needsReauthorization: false,
      },
    ]);

    const response = await GET(getRequest());
    const body = (await response.json()) as { connectors: Array<{ connectorId: string }> };

    expect(body.connectors.some((c) => c.connectorId === 'linear')).toBe(false);
  });

  it('revokes the grant, closes the live handle, and clears saved verdicts on disconnect', async () => {
    mocks.oauthConfiguredIds.mockReturnValue(new Set(['linear']));
    mocks.disconnectOauth.mockResolvedValue(true);

    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/connectors?connectorId=linear', {
        method: 'DELETE',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.disconnectOauth).toHaveBeenCalledWith('user-1', 'linear');
    expect(mocks.evictOauthCaches).toHaveBeenCalledWith('user-1', 'linear');
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('delete from public.connector_tool_permissions'),
      ['user-1', 'linear'],
    );
    // No user_connectors row exists for an OAuth connector, so nothing should
    // be soft-deleted there.
    expect(
      mocks.execute.mock.calls.some(([sql]) => String(sql).includes('update user_connectors')),
    ).toBe(false);
  });

  it('fails closed when the real GitHub installation signal cannot be loaded', async () => {
    mocks.githubInstallations.mockRejectedValue(new Error('database unavailable'));

    const response = await GET(getRequest());

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe('An unexpected error occurred');
  });
});
