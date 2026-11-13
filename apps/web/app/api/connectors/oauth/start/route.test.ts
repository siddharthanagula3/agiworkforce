import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

type WorkspaceGateModule = typeof import('@/lib/managed-compute-gate');

const WORKSPACE_ACCESS_ALLOWED = {
  allowed: true,
  code: 'allowed',
  reason: 'Allowed by workspace policy.',
  obligations: [],
  organizationId: null,
};
const { mockEvaluateWorkspaceAccess } = vi.hoisted(() => ({
  mockEvaluateWorkspaceAccess: vi.fn(),
}));

vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<WorkspaceGateModule>()),
  evaluateWorkspaceAccess: mockEvaluateWorkspaceAccess,
}));
import { NextRequest } from 'next/server';

const connectorRelease = vi.hoisted(() => ({ released: true }));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<TypesModule>()),
  connectorsReleased: () => connectorRelease.released,
  connectorReleased: () => connectorRelease.released,
  hasReleasedConnectors: () => connectorRelease.released,
}));

const mocks = vi.hoisted(() => ({
  markAppReturn: vi.fn(async (..._args: unknown[]) => true),
  authUser: vi.fn(),
  createPending: vi.fn(),
  listAccounts: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
}));

vi.mock('server-only', () => ({}));
type EntitlementResolutionModule = typeof import('@/lib/services/entitlement-resolution');
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<EntitlementResolutionModule>()),
  resolveEntitledPlanTier: vi.fn(async () => 'pro'),
}));
vi.mock('@/lib/auth/email-confirmation', async (importOriginal) => ({
  ...(await importOriginal()),
  readPrimaryEmailState: vi.fn(async () => ({ confirmed: true, email: 'person@example.com' })),
}));
vi.mock('@/lib/api-auth', async () => ({
  ...(await vi.importActual<ApiAuthModule>('@/lib/api-auth')),

  isAccountUnavailableError: vi.fn(() => false),
  getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a),
}));
vi.mock('@/lib/server/rls-db', async () => ({
  ...(await vi.importActual<RlsDbModule>('@/lib/server/rls-db')),

  getUserScopedDb: async (...a: unknown[]) => {
    const { userId, surface } = (await mocks.authUser(...a)) as {
      userId: string;
      surface?: string;
    };
    return { db: { query: vi.fn(), execute: vi.fn() }, userId, organizationId: null, surface };
  },
}));
vi.mock('@/lib/rate-limit', async () => ({
  ...(await vi.importActual<RateLimitModule>('@/lib/rate-limit')),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async () => ({
  ...(await vi.importActual<LoggerModule>('@/lib/logger')),

  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/connectors/oauth-store', async () => ({
  ...(await vi.importActual<OauthStoreModule>('@/lib/connectors/oauth-store')),

  markAppReturn: (...a: unknown[]) => mocks.markAppReturn(...a),
  getUserConnectorOAuthGrantSummaries: vi.fn(async () => []),
  listConnectorAccounts: (...a: unknown[]) => mocks.listAccounts(...a),
  createPendingAuthorization: (...a: unknown[]) => mocks.createPending(...a),
  upsertConnectorOAuthGrant: vi.fn(),
}));

import { GET } from './route';
import { __resetConnectorOAuthRegistryCacheForTests } from '@/lib/connectors/oauth-registry';
type ApiAuthModule = typeof import('@/lib/api-auth');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type RateLimitModule = typeof import('@/lib/rate-limit');
type LoggerModule = typeof import('@/lib/logger');
type OauthStoreModule = typeof import('@/lib/connectors/oauth-store');

type TypesModule = typeof import('@agiworkforce/types');

const ENV_KEYS = [
  'CONNECTOR_OAUTH_PROVIDERS_JSON',
  'CONNECTOR_OAUTH_REDIRECT_BASE_URL',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_ID',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET',
];

function configureLinear(): void {
  process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'] = JSON.stringify({
    providers: [
      {
        connectorId: 'linear',
        displayName: 'Linear',
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        mcpUrl: 'https://mcp.example.com/mcp',
        scopes: ['read', 'write'],
      },
    ],
  });
  process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_ID'] = 'client-id-value';
  process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET'] = 'client-secret-value';
  __resetConnectorOAuthRegistryCacheForTests();
}

function request(query: string): NextRequest {
  return new NextRequest(`https://app.example.com/api/connectors/oauth/start${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEvaluateWorkspaceAccess.mockResolvedValue(WORKSPACE_ACCESS_ALLOWED);
  mocks.authUser.mockResolvedValue({ userId: 'user-1' });
  mocks.listAccounts.mockResolvedValue([]);
  mocks.createPending.mockResolvedValue(undefined);
  for (const key of ENV_KEYS) delete process.env[key];
  process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'https://app.example.com';
  __resetConnectorOAuthRegistryCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of ENV_KEYS) delete process.env[key];
  __resetConnectorOAuthRegistryCacheForTests();
});

describe('GET /api/connectors/oauth/start', () => {
  it.each(['linear', 'notion'])(
    'rejects %s OAuth before discovery or persistence without a storage key',
    async (connectorId) => {
      configureLinear();
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY', '');
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      const response = await GET(request(`?connectorId=${connectorId}&mode=json`));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        status: 'unavailable',
        error: expect.stringContaining('secure token storage'),
      });
      expect(mocks.createPending).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock.mockRestore();
    },
  );

  it('refuses a client the workspace does not allow before any authorization is started', async () => {
    configureLinear();
    mocks.authUser.mockResolvedValue({ userId: 'user-1', surface: 'chrome' });
    mockEvaluateWorkspaceAccess.mockResolvedValue({
      allowed: false,
      code: 'surface_not_allowed',
      reason:
        'Your workspace administrator does not allow access to this workspace from the Chrome extension.',
      obligations: [],
      organizationId: 'org-1',
    });

    const response = await GET(request('?connectorId=linear&mode=json'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ status: 'policy_blocked' });
    expect(mockEvaluateWorkspaceAccess).toHaveBeenCalledWith('user-1', expect.anything(), 'chrome');
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it('answers an unreadable workspace policy as unavailable, not as allowed', async () => {
    configureLinear();
    mockEvaluateWorkspaceAccess.mockResolvedValue({
      allowed: false,
      code: 'workspace_policy_unavailable',
      reason: 'We could not confirm your workspace security settings.',
      obligations: [],
      organizationId: null,
    });

    const response = await GET(request('?connectorId=linear&mode=json'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: 'unavailable' });
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it('refuses to start a flow for a provider with no OAuth app configured', async () => {
    const response = await GET(request('?connectorId=trello'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') as string);
    expect(location.pathname).toBe('/connectors');
    expect(location.searchParams.get('status')).toBe('not_configured');
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it('answers a native client honestly in JSON mode instead of redirecting', async () => {
    const response = await GET(request('?connectorId=trello&mode=json'));

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({ status: 'not_configured' });
  });

  it('reports a self-service discovery failure as an upstream failure, not as unconfigured', async () => {
    const response = await GET(request('?connectorId=linear&mode=json'));

    expect(response.status).toBe(502);
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it('marks a sign-in the app starts so the callback returns it to the app', async () => {
    configureLinear();

    const response = await GET(request('?connectorId=linear&mode=json&appReturn=1'));
    const body = (await response.json()) as { authorizeUrl: string; appReturn?: boolean };

    const state = new URL(body.authorizeUrl).searchParams.get('state');
    expect(mocks.markAppReturn).toHaveBeenCalledWith('user-1', state);
    expect(body.appReturn).toBe(true);
  });

  it('leaves a web sign-in to finish on the web', async () => {
    configureLinear();

    const response = await GET(request('?connectorId=linear&mode=json'));
    const body = (await response.json()) as { appReturn?: boolean };

    expect(mocks.markAppReturn).not.toHaveBeenCalled();
    expect(body.appReturn).toBeUndefined();
  });

  it('sends the user to the provider with PKCE, state, and the configured redirect', async () => {
    configureLinear();

    const response = await GET(request('?connectorId=linear'));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') as string);
    expect(location.origin + location.pathname).toBe('https://auth.example.com/authorize');
    expect(location.searchParams.get('client_id')).toBe('client-id-value');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://app.example.com/api/connectors/oauth/callback',
    );
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('scope')).toBe('read write');
    expect(location.searchParams.get('state')).toMatch(/^[a-f0-9]{64}$/);
    expect(location.searchParams.get('code_verifier')).toBeNull();
    expect(location.toString()).not.toContain('client-secret-value');
  });

  it('stores the verifier server-side, bound to the signed-in user, and never as a cookie', async () => {
    configureLinear();

    const response = await GET(request('?connectorId=linear'));

    expect(response.headers.get('set-cookie')).toBeNull();
    const pending = (mocks.createPending.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(pending['userId']).toBe('user-1');
    expect(pending['connectorId']).toBe('linear');
    expect(pending['redirectUri']).toBe('https://app.example.com/api/connectors/oauth/callback');
    expect(pending['codeChallengeMethod']).toBe('S256');
    expect(String(pending['codeVerifier']).length).toBeGreaterThan(20);
    const location = new URL(response.headers.get('location') as string);
    expect(pending['state']).toBe(location.searchParams.get('state'));
  });

  it('sanitizes an attacker-supplied return path', async () => {
    configureLinear();

    await GET(request('?connectorId=linear&returnPath=//evil.test'));

    const pending = (mocks.createPending.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(pending['returnPath']).toBe('/connectors');
  });

  it('refuses a return path the URL parser would collapse into another origin', async () => {
    const response = await GET(request('?connectorId=trello&returnPath=%2F%09%2Fevil.test'));

    const location = new URL(response.headers.get('location') as string);
    expect(location.origin).toBe('https://app.example.com');
    expect(location.pathname).toBe('/connectors');
  });

  it('sends a signed-out browser to login rather than starting a flow', async () => {
    configureLinear();
    mocks.authUser.mockRejectedValue(new Error('unauthenticated'));

    const response = await GET(request('?connectorId=linear'));

    expect(new URL(response.headers.get('location') as string).pathname).toBe('/login');
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it('names the widened scope as a re-consent instead of inheriting it', async () => {
    configureLinear();
    mocks.listAccounts.mockResolvedValue([
      { connectorId: 'linear', grantedScopes: ['read'], accountKey: 'default' },
    ]);

    const response = await GET(request('?connectorId=linear&mode=json'));

    await expect(response.json()).resolves.toMatchObject({
      status: 'scope_reconsent',
      addedScopes: ['write'],
    });
  });

  it('is not a re-consent when the stored grant already covers what is declared', async () => {
    configureLinear();
    mocks.listAccounts.mockResolvedValue([
      { connectorId: 'linear', grantedScopes: ['read', 'write'], accountKey: 'default' },
    ]);

    const body = (await (await GET(request('?connectorId=linear&mode=json'))).json()) as {
      status?: string;
    };

    expect(body.status).toBeUndefined();
  });

  it('never requests a scope above the reviewed ceiling', async () => {
    process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'] = JSON.stringify({
      providers: [
        {
          connectorId: 'linear',
          displayName: 'Linear',
          authorizationUrl: 'https://auth.example.com/authorize',
          tokenUrl: 'https://auth.example.com/token',
          mcpUrl: 'https://mcp.example.com/mcp',
          scopes: ['read', 'admin:everything'],
        },
      ],
    });
    process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_ID'] = 'client-id-value';
    process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET'] = 'client-secret-value';
    __resetConnectorOAuthRegistryCacheForTests();

    await GET(request('?connectorId=linear&mode=json'));

    expect(mocks.createPending).toHaveBeenCalledWith(
      expect.objectContaining({ requestedScopes: ['read'] }),
    );
  });

  it('refuses when the deployment has no callback origin configured', async () => {
    configureLinear();
    delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
    delete process.env['NEXT_PUBLIC_APP_URL'];

    const response = await GET(request('?connectorId=linear&mode=json'));

    expect(response.status).toBe(501);
    expect(mocks.createPending).not.toHaveBeenCalled();
  });
});

describe('GET /api/connectors/oauth/start while connectors are coming soon', () => {
  beforeEach(() => {
    connectorRelease.released = false;
  });
  afterEach(() => {
    connectorRelease.released = true;
  });

  it('refuses before any authorization is started, with a plain coming-soon message', async () => {
    configureLinear();

    const response = await GET(request('?connectorId=linear&mode=json'));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      message: 'Connectors are coming soon.',
      connectorId: 'linear',
    });
    expect(mocks.createPending).not.toHaveBeenCalled();
  });

  it('sends a browser back to where it came from instead of to the provider', async () => {
    configureLinear();

    const response = await GET(request('?connectorId=linear'));

    const location = new URL(response.headers.get('location') as string);
    expect(location.origin).toBe('https://app.example.com');
    expect(location.searchParams.get('code_challenge')).toBeNull();
    expect(mocks.createPending).not.toHaveBeenCalled();
  });
});

type CompleteMockModule0 = typeof import('@/lib/api-auth');

type RetainedMockModule0 = typeof import('@/lib/logger');
