import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  class ConnectorOAuthStoreUnavailableError extends Error {
    constructor() {
      super('unavailable');
      this.name = 'ConnectorOAuthStoreUnavailableError';
    }
  }
  return {
    authUser: vi.fn(),
    createPending: vi.fn(),
    ConnectorOAuthStoreUnavailableError,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  ConnectorOAuthStoreUnavailableError: mocks.ConnectorOAuthStoreUnavailableError,
  createPendingAuthorization: (...a: unknown[]) => mocks.createPending(...a),
  upsertConnectorOAuthGrant: vi.fn(),
}));

import { GET } from './route';
import { __resetConnectorOAuthRegistryCacheForTests } from '@/lib/connectors/oauth-registry';

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
  mocks.authUser.mockResolvedValue({ userId: 'user-1' });
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

  it('reports honestly when the broker tables are not migrated', async () => {
    configureLinear();
    mocks.createPending.mockRejectedValue(new mocks.ConnectorOAuthStoreUnavailableError());

    const response = await GET(request('?connectorId=linear&mode=json'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: 'unavailable' });
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
