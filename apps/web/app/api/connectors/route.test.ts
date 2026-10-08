import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  connectorIdsWithMcpEndpoint,
  isSelfServiceConnector,
} from '@/lib/connectors/mcp-endpoints';
type ScanModule0 = typeof import('@/lib/services/connector-policy-gate');
type ScanModule1 = typeof import('@/lib/services/active-workspace-service');
type ScanModule2 = typeof import('@/lib/services/connector-policy-service');
type ScanModule3 = typeof import('@/lib/connectors/connector-capability');
type ScanModule4 = typeof import('@/lib/services/entitlement-resolution');
type ScanModule5 = typeof import('@/lib/connectors/mcp-custom-connections');
type OAuthAccessModule = typeof import('@/lib/connectors/oauth-access');

interface DirectoryTargetFixture {
  connectorId: string;
  serverId: string;
  mcpUrl: string;
  transport: 'streamable-http' | 'sse';
  name: string;
  documentationUrl: string | null;
  record: { authMode: string };
}

const mocks = vi.hoisted(() => ({
  connectorPolicy: vi.fn(async (..._args: unknown[]) => ({
    allowed: true,
    code: 'ungoverned',
    reason: '',
    organizationId: null as string | null,
  })),
  activeOrganization: vi.fn(async (..._args: unknown[]): Promise<string | null> => null),
  workspacePolicy: vi.fn(async (..._args: unknown[]): Promise<unknown> => null),
  query: vi.fn(),
  execute: vi.fn(),
  githubInstallations: vi.fn(),
  customConnectors: vi.fn(),
  customByUrl: vi.fn(),
  evictCustomCaches: vi.fn(),
  operatorIds: new Set(['slack']),
  linkingAvailable: vi.fn(() => false),
  oauthConfiguredIds: vi.fn(() => new Set<string>()),
  oauthGrants: vi.fn(),
  pendingConnectors: vi.fn(),
  disconnectOauth: vi.fn(),
  evictOauthCaches: vi.fn(),
  describeSetup: vi.fn(),
  directoryTargets: new Map<string, DirectoryTargetFixture>(),
  directoryAuthMode: vi.fn(),
  probe: vi.fn(),
  insertCustom: vi.fn(),
  deleteCustom: vi.fn(),
  clearPermissions: vi.fn(),
  cacheToolNames: vi.fn(),
}));

const connectorRelease = vi.hoisted(() => ({ released: true }));

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<TypesModule>()),
  connectorsReleased: () => connectorRelease.released,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/services/connector-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  evaluateConnectorPolicyForUser: (...args: unknown[]) => mocks.connectorPolicy(...args),
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  resolveActiveOrganizationId: (...args: unknown[]) => mocks.activeOrganization(...args),
}));
vi.mock('@/lib/services/connector-policy-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  readConnectorPolicy: (...args: unknown[]) => mocks.workspacePolicy(...args),
}));
vi.mock('@/lib/connectors/connector-capability', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  connectorsAllowedWithoutRequest: vi.fn(async () => true),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  resolveEntitledPlanTier: vi.fn(async () => 'pro'),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.execute(...args),
    },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  getOperatorMappedConnectorIds: vi.fn(() => mocks.operatorIds),
  getUserGithubInstallations: (...args: unknown[]) => mocks.githubInstallations(...args),
  getUserCustomConnectorSummaries: (...args: unknown[]) => mocks.customConnectors(...args),
  findUserCustomConnectorByUrl: (...args: unknown[]) => mocks.customByUrl(...args),
  evictConnectorOAuthCaches: (...args: unknown[]) => mocks.evictOauthCaches(...args),
  evictCustomConnectorCaches: (...args: unknown[]) => mocks.evictCustomCaches(...args),
}));
vi.mock('@/lib/connectors/oauth-setup', () => ({
  regionRequirement: vi.fn(() => null),
  describeConnectorSetup: (...args: unknown[]) => mocks.describeSetup(...args),
}));
vi.mock('@/lib/connectors/mcp-directory-targets', () => ({
  isDirectoryServerId: (ref: string) => ref.startsWith('dir-'),
  normalizeRemoteUrl: (url: string) => new URL(url).toString(),
  resolveDirectoryTarget: async (ref: string) => mocks.directoryTargets.get(ref) ?? null,
  findDirectoryTargetByRemoteUrl: async (url: string) =>
    [...mocks.directoryTargets.values()].find((target) => target.mcpUrl === url) ?? null,
  resolveDirectoryConnectAuthMode: (...args: unknown[]) => mocks.directoryAuthMode(...args),
}));
vi.mock('@/lib/connectors/mcp-custom-connections', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  probeMcpServer: (...args: unknown[]) => mocks.probe(...args),
  insertCustomConnector: (...args: unknown[]) => mocks.insertCustom(...args),
  deleteCustomConnectorRows: (...args: unknown[]) => mocks.deleteCustom(...args),
  clearConnectorToolPermissions: (...args: unknown[]) => mocks.clearPermissions(...args),
  assertCustomConnectorCapacity: vi.fn(async () => ({ planTier: 'pro', connectorLimit: 25 })),
  assertConnectorToolCapacity: vi.fn(),
}));
vi.mock('@/lib/connectors/directory/tool-names-cache', () => ({
  setCachedToolNames: (...args: unknown[]) => mocks.cacheToolNames(...args),
  getCachedToolNames: vi.fn(async () => null),
}));
vi.mock('@/lib/mcp-url-validation', () => ({
  validateHttpsMcpUrl: vi.fn(async (raw: unknown) => new URL(String(raw))),
}));
vi.mock('@/lib/connectors/oauth-registry', () => ({
  CONNECTOR_OAUTH_PROVIDERS_ENV: 'CONNECTOR_OAUTH_PROVIDERS_JSON',
  CONNECTOR_OAUTH_REDIRECT_BASE_ENV: 'CONNECTOR_OAUTH_REDIRECT_BASE_URL',
  connectorOAuthCredentialEnvNames: (id: string) => ({
    clientId: `CONNECTOR_OAUTH_${id.toUpperCase()}_CLIENT_ID`,
    clientSecret: `CONNECTOR_OAUTH_${id.toUpperCase()}_CLIENT_SECRET`,
  }),
  getConnectorOAuthRedirectUri: () => 'https://app.example.com/api/connectors/oauth/callback',
  hasConnectorOAuthDescriptor: () => false,
  getOAuthConfiguredConnectorIds: () => mocks.oauthConfiguredIds(),
  isConnectorOAuthConfigured: (id: string) => mocks.oauthConfiguredIds().has(id),
  isConnectorOAuthSupported: (id: string) =>
    mocks.oauthConfiguredIds().has(id) || isSelfServiceConnector(id),
  buildConnectorOAuthStartPath: (id: string) => `/api/connectors/oauth/start?connectorId=${id}`,
  getConnectorOAuthProvider: vi.fn(),
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  getUserConnectorOAuthGrantSummaries: (...args: unknown[]) => mocks.oauthGrants(...args),
  listPendingConnectorIds: (...args: unknown[]) => mocks.pendingConnectors(...args),
  listConnectorAccounts: vi.fn(async () => []),
  ConnectorGrantDecryptionError: class ConnectorGrantDecryptionError extends Error {},
  getConnectorOAuthGrant: vi.fn(),
  revokeConnectorOAuthGrant: vi.fn(),
  listRevocableConnectorTokens: vi.fn(async () => []),
  updateConnectorOAuthGrantTokens: vi.fn(),
  ConnectorGrantLockTimeoutError: class ConnectorGrantLockTimeoutError extends Error {},
  withLockedConnectorOAuthGrant: vi.fn(),
}));
vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<OAuthAccessModule>()),
  disconnectConnectorOAuthGrant: (...args: unknown[]) => mocks.disconnectOauth(...args),
  resolveConnectorAccessToken: vi.fn(),
}));
vi.mock('@/lib/github-app', () => ({
  GitHubWriteOutcomeUnknownError: class GitHubWriteOutcomeUnknownError extends Error {},
  issueCommentPostedSince: vi.fn(() => false),
  pullRequestReviewPostedSince: vi.fn(() => false),
  getGitHubAppInstallUrl: vi.fn(() => 'https://github.com/apps/agi/installations/new'),
  isGitHubAppConfigured: vi.fn(() => true),
  isGitHubInstallationLinkingAvailable: () => mocks.linkingAvailable(),
  missingGitHubInstallationLinkingVars: vi.fn(() => []),
  getInstallationAccessToken: vi.fn(),
  getPrDiff: vi.fn(),
  deleteGitHubAppInstallation: vi.fn(async () => ({ status: 'deleted' as const })),
  postIssueComment: vi.fn(),
  postPrReview: vi.fn(),
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

afterEach(() => vi.unstubAllEnvs());

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

import { getUserScopedDb } from '@/lib/server/rls-db';

type TypesModule = typeof import('@agiworkforce/types');

describe('/api/connectors tenant scope', () => {
  it('reads the connector list through the rls scoped handle', async () => {
    mocks.query.mockResolvedValueOnce([]);

    await GET(new NextRequest('http://localhost:3000/api/connectors'));

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
  });
});

function resetMocks(): void {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([]);
  mocks.execute.mockResolvedValue(undefined);
  mocks.githubInstallations.mockResolvedValue([]);
  mocks.customConnectors.mockResolvedValue([]);
  mocks.customByUrl.mockResolvedValue(null);
  mocks.evictCustomCaches.mockResolvedValue(undefined);
  mocks.linkingAvailable.mockReturnValue(false);
  mocks.oauthConfiguredIds.mockReturnValue(new Set<string>());
  mocks.oauthGrants.mockResolvedValue([]);
  mocks.pendingConnectors.mockResolvedValue([]);
  mocks.disconnectOauth.mockResolvedValue({
    disconnected: false,
    vendorRevocation: { status: 'nothing-to-revoke' },
  });
  mocks.evictOauthCaches.mockResolvedValue(undefined);
  mocks.describeSetup.mockReturnValue(null);
  mocks.directoryTargets.clear();
  mocks.directoryAuthMode.mockImplementation(
    async (target: DirectoryTargetFixture) => target.record.authMode,
  );
  mocks.probe.mockResolvedValue({
    toolCount: 2,
    toolNames: ['search_docs', 'get_doc'],
    capabilityCounts: { tools: 2, resources: 0, resourceTemplates: 0, prompts: 0, apps: 0 },
    protocolEra: 'modern',
  });
  mocks.insertCustom.mockResolvedValue({
    id: 'row-1',
    short_id: 'abc123def0',
    name: 'Tandem Docs MCP',
    url: 'https://tandem.ac/mcp',
    transport: 'streamable-http',
    created_at: '2026-09-05T00:00:00.000Z',
    updated_at: '2026-09-05T00:00:00.000Z',
  });
  mocks.deleteCustom.mockResolvedValue([]);
  mocks.clearPermissions.mockResolvedValue(undefined);
  mocks.cacheToolNames.mockResolvedValue(undefined);
  mocks.connectorPolicy.mockResolvedValue({
    allowed: true,
    code: 'ungoverned',
    reason: 'allowed',
    organizationId: null,
  });
  mocks.activeOrganization.mockResolvedValue(null);
  mocks.workspacePolicy.mockResolvedValue(null);
}

describe('/api/connectors managed-cloud capability boundary', () => {
  beforeEach(resetMocks);

  it('refuses a catalog connector before starting its connection when workspace policy blocks it', async () => {
    mocks.connectorPolicy.mockResolvedValueOnce({
      allowed: false,
      code: 'connector_blocked',
      reason: 'Blocked by workspace policy.',
      organizationId: null,
    });

    const response = await POST(postRequest('slack'));

    expect(response.status).toBe(403);
    expect(mocks.connectorPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ connectorId: 'slack', userId: 'user-1' }),
    );
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.insertCustom).not.toHaveBeenCalled();
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
      error: expect.stringContaining('Connect it from the CLI'),
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('shows a storage configuration error before redirecting to OAuth', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', '');

    const response = await POST(postRequest('notion'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      connectorId: 'notion',
      error: expect.stringContaining('secure token storage'),
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('accepts dropbox as a known connector id (honest 501, not the allowlist rejection)', async () => {
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

  it('advertises every self-service MCP connector without any operator OAuth app', async () => {
    const selfServiceIds = connectorIdsWithMcpEndpoint().filter((id) => isSelfServiceConnector(id));
    expect(selfServiceIds.length).toBeGreaterThan(0);

    const response = await GET(getRequest());
    const body = (await response.json()) as { available: string[] };

    for (const id of selfServiceIds) expect(body.available).toContain(id);
  });

  it('offers nothing to connect while connectors are coming soon', async () => {
    connectorRelease.released = false;
    try {
      const response = await GET(getRequest());
      const body = (await response.json()) as { available: string[] };

      expect(body.available).toEqual([]);
    } finally {
      connectorRelease.released = true;
    }
  });

  it('keeps a preregistered MCP connector unavailable until an operator configures its OAuth app', async () => {
    mocks.operatorIds = new Set<string>();
    const preregisteredIds = connectorIdsWithMcpEndpoint().filter(
      (id) => !isSelfServiceConnector(id),
    );
    expect(preregisteredIds.length).toBeGreaterThan(0);

    const response = await GET(getRequest());
    const body = (await response.json()) as { available: string[] };

    for (const id of preregisteredIds) expect(body.available).not.toContain(id);
  });

  it('advertises a provider as soon as an operator registers its OAuth app', async () => {
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
      installStartPath: '/api/connectors/oauth/start?connectorId=linear',
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('starts the OAuth flow for a configured provider outside VALID_CONNECTOR_IDS', async () => {
    mocks.oauthConfiguredIds.mockReturnValue(new Set(['airtable']));

    const getBody = (await (await GET(getRequest())).json()) as { available: string[] };
    expect(getBody.available).toContain('airtable');

    const response = await POST(postRequest('airtable'));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      connectorId: 'airtable',
      oauthStartPath: '/api/connectors/oauth/start?connectorId=airtable',
    });
    expect(
      mocks.query.mock.calls.some(([sql]) => String(sql).includes('insert into user_connectors')),
    ).toBe(false);
  });

  it('never rejects a connector the directory itself lists (audit CRIT-001)', async () => {
    const rejected: string[] = [];
    for (const connector of CONNECTORS) {
      const response = await POST(postRequest(connector.id));
      if (response.status === 400) rejected.push(connector.id);
    }
    expect(rejected).toEqual([]);
  });

  it('answers an unbuilt connector honestly instead of pretending it saved', async () => {
    const response = await POST(postRequest('trello'));

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({ connectorId: 'trello' });
    expect(
      mocks.query.mock.calls.some(([sql]) => String(sql).includes('insert into user_connectors')),
    ).toBe(false);
  });

  it('sends a self-service MCP connector to authorization rather than saving a row', async () => {
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

  it('reports a self-service MCP grant as connected after discovered OAuth completes', async () => {
    mocks.oauthGrants.mockResolvedValue([
      {
        connectorId: 'airtable',
        grantedScopes: ['data.records:read'],
        connectedAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        needsReauthorization: false,
      },
    ]);

    const response = await GET(getRequest());
    const body = (await response.json()) as {
      connectors: Array<{ connectorId: string; source: string; scopes?: string[] }>;
    };

    expect(body.connectors.find((connector) => connector.connectorId === 'airtable')).toMatchObject(
      {
        source: 'oauth',
        scopes: ['data.records:read'],
      },
    );
  });

  it('does not report a grant whose provider is no longer configured', async () => {
    mocks.oauthGrants.mockResolvedValue([
      {
        connectorId: 'dropbox',
        grantedScopes: [],
        connectedAt: '',
        updatedAt: '',
        needsReauthorization: false,
      },
    ]);

    const response = await GET(getRequest());
    const body = (await response.json()) as { connectors: Array<{ connectorId: string }> };

    expect(body.connectors.some((c) => c.connectorId === 'dropbox')).toBe(false);
  });

  it('revokes the grant, closes the live handle, and clears saved verdicts on disconnect', async () => {
    mocks.oauthConfiguredIds.mockReturnValue(new Set(['linear']));
    mocks.disconnectOauth.mockResolvedValue({
      disconnected: true,
      vendorRevocation: { status: 'revoked' },
    });

    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/connectors?connectorId=linear', {
        method: 'DELETE',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.disconnectOauth).toHaveBeenCalledWith('user-1', 'linear');
    expect(mocks.evictOauthCaches).toHaveBeenCalledWith('user-1', 'linear');
    expect(mocks.clearPermissions).toHaveBeenCalledWith(expect.anything(), 'user-1', 'linear');
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

const OPEN_RECORD_ID = 'ac.tandem/docs-mcp';
const OAUTH_RECORD_ID = 'ch.cowork24/booking';
const API_KEY_RECORD_ID = 'ai.fodda/mcp-server';

function directoryTarget(
  connectorId: string,
  authMode: string,
  mcpUrl: string,
  name: string,
): DirectoryTargetFixture {
  return {
    connectorId,
    serverId: `dir-${connectorId.replace(/[^a-z0-9]/g, '').slice(0, 12)}`,
    mcpUrl,
    transport: 'streamable-http',
    name,
    documentationUrl: `https://docs.example.com/${connectorId}`,
    record: { authMode },
  };
}

function deleteRequest(connectorId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/connectors?connectorId=${encodeURIComponent(connectorId)}`,
    { method: 'DELETE' },
  );
}

describe('/api/connectors directory records', () => {
  beforeEach(() => {
    resetMocks();
    mocks.directoryTargets.set(
      OPEN_RECORD_ID,
      directoryTarget(OPEN_RECORD_ID, 'none', 'https://tandem.ac/mcp', 'Tandem Docs MCP'),
    );
    mocks.directoryTargets.set(
      OAUTH_RECORD_ID,
      directoryTarget(OAUTH_RECORD_ID, 'oauth', 'https://mcp.cowork24.ch/mcp', 'Cowork24'),
    );
    mocks.directoryTargets.set(
      API_KEY_RECORD_ID,
      directoryTarget(API_KEY_RECORD_ID, 'api-key', 'https://mcp.fodda.ai/mcp', 'Fodda'),
    );
  });

  it('refuses a directory endpoint before discovery or probing when workspace policy blocks it', async () => {
    mocks.connectorPolicy.mockResolvedValueOnce({
      allowed: false,
      code: 'custom_connectors_disabled',
      reason: 'Custom connectors are disabled.',
      organizationId: null,
    });

    const response = await POST(postRequest(OPEN_RECORD_ID));

    expect(response.status).toBe(403);
    expect(mocks.connectorPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: OPEN_RECORD_ID,
        isCustom: true,
        url: 'https://tandem.ac/mcp',
      }),
    );
    expect(mocks.directoryAuthMode).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.insertCustom).not.toHaveBeenCalled();
  });

  it('connects an open server in one click through the custom-connector path', async () => {
    const response = await POST(postRequest(OPEN_RECORD_ID));
    const body = (await response.json()) as {
      connector: { connectorId: string; toolConnectorId: string; directoryId: string };
      toolNames: string[];
    };

    expect(response.status).toBe(201);
    expect(body.connector).toMatchObject({
      connectorId: OPEN_RECORD_ID,
      toolConnectorId: 'custom-abc123def0',
      directoryId: OPEN_RECORD_ID,
      source: 'custom',
    });
    expect(body.toolNames).toEqual(['search_docs', 'get_doc']);
    expect(mocks.probe).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://tandem.ac/mcp', transport: 'streamable-http' }),
    );
    expect(mocks.probe.mock.calls[0]?.[0]).not.toHaveProperty('headers');
    expect(mocks.insertCustom).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Tandem Docs MCP',
        url: 'https://tandem.ac/mcp',
        credentialEnc: null,
      }),
    );
    expect(mocks.cacheToolNames).toHaveBeenCalledWith(OPEN_RECORD_ID, ['search_docs', 'get_doc']);
  });

  it('asks the connection gate before connecting an open server, and stores nothing when refused', async () => {
    mocks.connectorPolicy.mockResolvedValueOnce({
      allowed: false,
      code: 'connectors_unavailable',
      reason: 'Connectors are unavailable right now.',
      organizationId: null,
    });

    const response = await POST(postRequest(OPEN_RECORD_ID));

    expect(response.status).toBe(403);
    expect(mocks.connectorPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: OPEN_RECORD_ID,
        isCustom: true,
        url: 'https://tandem.ac/mcp',
      }),
    );
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.insertCustom).not.toHaveBeenCalled();
  });

  it('answers an open server that is already connected without probing again', async () => {
    mocks.customByUrl.mockResolvedValue({
      id: 'row-1',
      shortId: 'abc123def0',
      connectorId: 'custom-abc123def0',
      name: 'Tandem Docs MCP',
      url: 'https://tandem.ac/mcp',
      transport: 'streamable-http',
    });

    const response = await POST(postRequest(OPEN_RECORD_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      alreadyConnected: true,
      connector: { connectorId: OPEN_RECORD_ID, toolConnectorId: 'custom-abc123def0' },
    });
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.insertCustom).not.toHaveBeenCalled();
  });

  it('sends an OAuth record through the discovery start route under its own id', async () => {
    const response = await POST(postRequest(OAUTH_RECORD_ID));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      connectorId: OAUTH_RECORD_ID,
      oauthStartPath: `/api/connectors/oauth/start?connectorId=${OAUTH_RECORD_ID}`,
      message: expect.stringContaining('Cowork24'),
    });
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it('points an API-key record at its credential form instead of redirecting', async () => {
    const response = await POST(postRequest(API_KEY_RECORD_ID));

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      credentialsPath: string;
      oauthStartPath?: string;
      message: string;
    };
    expect(body.credentialsPath).toBe(
      `/api/connectors/${encodeURIComponent(API_KEY_RECORD_ID)}/credentials`,
    );
    expect(body.oauthStartPath).toBeUndefined();
    expect(body.message).toContain('Fodda');
    expect(body.message).toContain('API key');
  });

  it('refuses a record whose authentication stays unknown after a probe', async () => {
    mocks.directoryTargets.set(
      'io.github.someone/opaque',
      directoryTarget(
        'io.github.someone/opaque',
        'unknown',
        'https://opaque.example.com/mcp',
        'Opaque',
      ),
    );

    const response = await POST(postRequest('io.github.someone/opaque'));

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining('Opaque'),
    });
    expect(mocks.insertCustom).not.toHaveBeenCalled();
  });

  it('turns a probe failure into a plain sentence naming the server', async () => {
    const { McpProbeError } = await import('@/lib/connectors/mcp-custom-connections');
    mocks.probe.mockRejectedValue(new McpProbeError('connection timed out', false));

    const response = await POST(postRequest(OPEN_RECORD_ID));

    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toContain('Tandem Docs MCP could not be reached');
    expect(mocks.insertCustom).not.toHaveBeenCalled();
  });

  it('lists a linked custom row under the directory id and an OAuth grant with its name', async () => {
    mocks.customConnectors.mockResolvedValue([
      {
        id: 'row-1',
        shortId: 'abc123def0',
        name: 'Tandem Docs MCP',
        url: 'https://tandem.ac/mcp',
        transport: 'streamable-http',
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z',
      },
    ]);
    mocks.oauthGrants.mockResolvedValue([
      {
        connectorId: OAUTH_RECORD_ID,
        grantedScopes: ['booking:read'],
        connectedAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z',
        needsReauthorization: false,
      },
    ]);

    const body = (await (await GET(getRequest())).json()) as {
      connectors: Array<Record<string, unknown>>;
    };

    expect(body.connectors.find((c) => c['connectorId'] === OPEN_RECORD_ID)).toMatchObject({
      toolConnectorId: 'custom-abc123def0',
      directoryId: OPEN_RECORD_ID,
      source: 'custom',
      health: 'connected',
    });
    expect(body.connectors.find((c) => c['connectorId'] === OAUTH_RECORD_ID)).toMatchObject({
      source: 'oauth',
      name: 'Cowork24',
      directoryId: OAUTH_RECORD_ID,
      scopes: ['booking:read'],
      health: 'connected',
    });
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });

  it('reports a custom row whose sealed credential no longer opens as needing reconnection', async () => {
    mocks.customConnectors.mockResolvedValue([
      {
        id: 'row-1',
        shortId: 'abc123def0',
        name: 'Tandem Docs MCP',
        url: 'https://tandem.ac/mcp',
        transport: 'streamable-http',
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z',
        credentialUnreadable: true,
      },
    ]);

    const body = (await (await GET(getRequest())).json()) as {
      connectors: Array<Record<string, unknown>>;
    };

    expect(body.connectors.find((c) => c['connectorId'] === OPEN_RECORD_ID)).toMatchObject({
      source: 'custom',
      needsReauthorization: true,
      health: 'needs-reauthorization',
    });
  });

  it('names the missing env pair for every curated connector that needs setup', async () => {
    mocks.describeSetup.mockImplementation((connectorId: string, displayName?: string) =>
      connectorId === 'gmail'
        ? {
            connectorId,
            kind: 'oauth-client-pair',
            missingEnv: ['CONNECTOR_OAUTH_GMAIL_CLIENT_ID', 'CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET'],
            message: `${displayName} needs CONNECTOR_OAUTH_GMAIL_CLIENT_ID and CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET on this deployment.`,
          }
        : null,
    );

    const body = (await (await GET(getRequest())).json()) as {
      setup: Record<string, { missingEnv: string[]; message: string }>;
    };

    expect(body.setup['gmail']).toMatchObject({
      missingEnv: ['CONNECTOR_OAUTH_GMAIL_CLIENT_ID', 'CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET'],
      message: expect.stringContaining('Gmail needs CONNECTOR_OAUTH_GMAIL_CLIENT_ID'),
    });
    expect(Object.keys(body.setup)).toEqual(['gmail']);
  });

  it('answers a needs-setup curated OAuth connector with the env names instead of a redirect', async () => {
    mocks.describeSetup.mockImplementation((connectorId: string) =>
      connectorId === 'notion'
        ? {
            connectorId,
            kind: 'oauth-redirect-base',
            missingEnv: ['CONNECTOR_OAUTH_REDIRECT_BASE_URL'],
            message:
              'notion needs CONNECTOR_OAUTH_REDIRECT_BASE_URL set to a public HTTPS origin on this deployment.',
          }
        : null,
    );

    const response = await POST(postRequest('notion'));

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({
      connectorId: 'notion',
      message: expect.stringContaining('CONNECTOR_OAUTH_REDIRECT_BASE_URL'),
      setup: { missingEnv: ['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] },
    });
    const listed = (await (await GET(getRequest())).json()) as { available: string[] };
    expect(listed.available).not.toContain('notion');
  });

  it('disconnects a directory record from whichever store holds it', async () => {
    mocks.customByUrl.mockResolvedValue({
      id: 'row-1',
      shortId: 'abc123def0',
      connectorId: 'custom-abc123def0',
      name: 'Tandem Docs MCP',
      url: 'https://tandem.ac/mcp',
      transport: 'streamable-http',
    });
    mocks.deleteCustom.mockResolvedValue([{ id: 'row-1', short_id: 'abc123def0' }]);
    mocks.disconnectOauth.mockResolvedValue({
      disconnected: true,
      vendorRevocation: { status: 'revoked' },
    });

    const response = await DELETE(deleteRequest(OPEN_RECORD_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.disconnectOauth).toHaveBeenCalledWith('user-1', 'custom-abc123def0');
    expect(mocks.disconnectOauth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteCustom.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.deleteCustom).toHaveBeenCalledWith(expect.anything(), 'user-1', 'row-1');
    expect(mocks.evictCustomCaches).toHaveBeenCalledWith('user-1', 'row-1');
    expect(mocks.clearPermissions).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'custom-abc123def0',
    );
    expect(mocks.disconnectOauth).toHaveBeenCalledWith('user-1', OPEN_RECORD_ID);
    expect(mocks.evictOauthCaches).toHaveBeenCalledWith('user-1', OPEN_RECORD_ID);
  });

  it('tells the user access may remain at a directory vendor that could not revoke it', async () => {
    mocks.disconnectOauth.mockResolvedValue({
      disconnected: true,
      vendorRevocation: { status: 'not-revoked', reason: 'failed', manageUrl: null },
    });

    const response = await DELETE(deleteRequest(OAUTH_RECORD_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      vendorNotice:
        'Disconnected here, but Cowork24 did not confirm that it revoked access, so access may ' +
        'remain until you remove it in your Cowork24 account settings.',
    });
    expect(mocks.evictOauthCaches).toHaveBeenCalledWith('user-1', OAUTH_RECORD_ID);
  });

  it('still refuses an id that is neither curated nor in the directory', async () => {
    const response = await DELETE(deleteRequest('totally-made-up'));

    expect(response.status).toBe(400);
  });
});

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

function workspaceConnectorPolicy(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: WORKSPACE_ID,
    allowedConnectors: [],
    blockedConnectors: [],
    allowCustomConnectors: true,
    allowedPlugins: [],
    blockedPlugins: [],
    allowedMcpHosts: [],
    allowedWebDomains: [],
    blockedWebDomains: [],
    toolRules: [],
    updatedByUserId: null,
    updatedAt: '2026-09-29T00:00:00.000Z',
    ...overrides,
  };
}

function savedConnectorRow(sql: unknown): unknown[] {
  if (!String(sql).includes('insert into user_connectors')) return [];
  return [
    {
      id: 'row-9',
      connector_id: 'slack',
      auth_type: 'local',
      connected_at: '2026-09-29T00:00:00.000Z',
      updated_at: '2026-09-29T00:00:00.000Z',
    },
  ];
}

describe('POST /api/connectors for a member of a governed workspace', () => {
  beforeEach(async () => {
    resetMocks();
    const gate = await vi.importActual<ScanModule0>('@/lib/services/connector-policy-gate');
    mocks.connectorPolicy.mockImplementation((...args: unknown[]) =>
      gate.evaluateConnectorPolicyForUser(
        args[0] as Parameters<typeof gate.evaluateConnectorPolicyForUser>[0],
      ),
    );
    mocks.activeOrganization.mockResolvedValue(WORKSPACE_ID);
    mocks.operatorIds = new Set(['slack']);
    mocks.query.mockImplementation(async (sql: unknown) => savedConnectorRow(sql));
    mocks.directoryTargets.set(
      OPEN_RECORD_ID,
      directoryTarget(OPEN_RECORD_ID, 'none', 'https://tandem.ac/mcp', 'Tandem Docs MCP'),
    );
  });

  it('refuses a directory server when the workspace allows no custom connectors', async () => {
    mocks.workspacePolicy.mockResolvedValue(
      workspaceConnectorPolicy({ allowCustomConnectors: false }),
    );

    const response = await POST(postRequest(OPEN_RECORD_ID));

    expect(response.status).toBe(403);
    expect(mocks.workspacePolicy).toHaveBeenCalledWith(expect.anything(), WORKSPACE_ID);
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.insertCustom).not.toHaveBeenCalled();
  });

  it('refuses to activate an operator connector the workspace has blocked', async () => {
    mocks.workspacePolicy.mockResolvedValue(
      workspaceConnectorPolicy({ blockedConnectors: ['slack'] }),
    );

    const response = await POST(postRequest('slack'));

    expect(response.status).toBe(403);
    expect(
      mocks.query.mock.calls.some(([sql]) => String(sql).includes('insert into user_connectors')),
    ).toBe(false);
  });

  it('activates the same operator connector once the workspace policy permits it', async () => {
    mocks.workspacePolicy.mockResolvedValue(workspaceConnectorPolicy());

    const response = await POST(postRequest('slack'));

    expect(response.status).toBe(201);
    expect(mocks.workspacePolicy).toHaveBeenCalledWith(expect.anything(), WORKSPACE_ID);
  });
});

describe('/api/connectors directory record response bodies, exact', () => {
  beforeEach(() => {
    resetMocks();
    mocks.directoryTargets.set(
      OAUTH_RECORD_ID,
      directoryTarget(OAUTH_RECORD_ID, 'oauth', 'https://mcp.cowork24.ch/mcp', 'Cowork24'),
    );
    mocks.directoryTargets.set(
      API_KEY_RECORD_ID,
      directoryTarget(API_KEY_RECORD_ID, 'api-key', 'https://mcp.fodda.ai/mcp', 'Fodda'),
    );
    mocks.directoryTargets.set(
      'io.github.someone/opaque',
      directoryTarget(
        'io.github.someone/opaque',
        'unknown',
        'https://opaque.example.com/mcp',
        'Opaque',
      ),
    );
  });

  it('409 for an OAuth record', async () => {
    const response = await POST(postRequest(OAUTH_RECORD_ID));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Cowork24 connects through its own authorization page.',
      message: 'Cowork24 connects through its own authorization page.',
      connectorId: OAUTH_RECORD_ID,
      oauthStartPath: `/api/connectors/oauth/start?connectorId=${OAUTH_RECORD_ID}`,
      installStartPath: `/api/connectors/oauth/start?connectorId=${OAUTH_RECORD_ID}`,
    });
  });

  it('409 for an API-key record', async () => {
    const response = await POST(postRequest(API_KEY_RECORD_ID));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Fodda needs an API key before it can connect.',
      message: 'Fodda needs an API key before it can connect.',
      connectorId: API_KEY_RECORD_ID,
      credentialsPath: '/api/connectors/ai.fodda%2Fmcp-server/credentials',
    });
  });

  it('501 for a record whose authentication is unknown', async () => {
    const response = await POST(postRequest('io.github.someone/opaque'));
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error:
        'Opaque does not say how it authenticates and did not answer a discovery probe, so it cannot be connected from the browser yet.',
      message:
        'Opaque does not say how it authenticates and did not answer a discovery probe, so it cannot be connected from the browser yet.',
      connectorId: 'io.github.someone/opaque',
    });
  });

  it('503 when the secret store is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', '');
    const response = await POST(postRequest(API_KEY_RECORD_ID));
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['connectorId', 'error', 'message']);
    expect(body['connectorId']).toBe(API_KEY_RECORD_ID);
    expect(body['error']).toBe(body['message']);
  });

  it('501 for a curated OAuth connector that still needs setup', async () => {
    const requirement = {
      connectorId: 'notion',
      kind: 'oauth-redirect-base',
      missingEnv: ['CONNECTOR_OAUTH_REDIRECT_BASE_URL'],
      message:
        'Notion needs CONNECTOR_OAUTH_REDIRECT_BASE_URL set to a public HTTPS origin on this deployment.',
    };
    mocks.describeSetup.mockImplementation((connectorId: string) =>
      connectorId === 'notion' ? requirement : null,
    );
    const response = await POST(postRequest('notion'));
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error: requirement.message,
      message: requirement.message,
      connectorId: 'notion',
      setup: {
        kind: requirement.kind,
        missingEnv: requirement.missingEnv,
        message: requirement.message,
      },
    });
  });
});

describe('GET /api/connectors unfinished authorizations', () => {
  beforeEach(resetMocks);

  it('reports the connectors an authorization was started for and abandoned', async () => {
    mocks.pendingConnectors.mockResolvedValue(['io.acme/one']);
    const response = await GET(getRequest());
    const body = (await response.json()) as { pending: string[] };
    expect(body.pending).toEqual(['io.acme/one']);
  });

  it('never reports one the account has since connected', async () => {
    mocks.pendingConnectors.mockResolvedValue(['github']);
    mocks.githubInstallations.mockResolvedValue([{ installationId: 1 }]);
    const response = await GET(getRequest());
    const body = (await response.json()) as { pending: string[] };
    expect(body.pending).toEqual([]);
  });

  /**
   * The pane is worth more than the hint: a store that cannot answer must not
   * take the connected list down with it.
   */
  it('still answers when the store cannot be read', async () => {
    mocks.pendingConnectors.mockRejectedValue(new Error('down'));
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { pending: string[] };
    expect(body.pending).toEqual([]);
  });
});
