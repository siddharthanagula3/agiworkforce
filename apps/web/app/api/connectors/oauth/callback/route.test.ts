import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  class ConnectorOAuthStoreUnavailableError extends Error {
    constructor() {
      super('unavailable');
      this.name = 'ConnectorOAuthStoreUnavailableError';
    }
  }
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
  return {
    authUser: vi.fn(),
    consumePending: vi.fn(),
    upsertGrant: vi.fn(),
    exchange: vi.fn(),
    audit: vi.fn(),
    warn: vi.fn(),
    ConnectorOAuthStoreUnavailableError,
    ConnectorOAuthTokenError,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: (...a: unknown[]) => mocks.warn(...a),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...a: unknown[]) => mocks.audit(...a),
  BLOCK_APPEAL_PATH: '/support',
  getClientIp: vi.fn(),
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  ConnectorOAuthStoreUnavailableError: mocks.ConnectorOAuthStoreUnavailableError,
  consumePendingAuthorization: (...a: unknown[]) => mocks.consumePending(...a),
  upsertConnectorOAuthGrant: (...a: unknown[]) => mocks.upsertGrant(...a),
  createPendingAuthorization: vi.fn(),
}));
vi.mock('@/lib/connectors/oauth-client', () => ({
  ConnectorOAuthTokenError: mocks.ConnectorOAuthTokenError,
  exchangeAuthorizationCode: (...a: unknown[]) => mocks.exchange(...a),
}));

import { GET } from './route';
import { __resetConnectorOAuthRegistryCacheForTests } from '@/lib/connectors/oauth-registry';

const ENV_KEYS = [
  'CONNECTOR_OAUTH_PROVIDERS_JSON',
  'CONNECTOR_OAUTH_REDIRECT_BASE_URL',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_ID',
  'CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET',
];

const REDIRECT_URI = 'https://app.example.com/api/connectors/oauth/callback';
const STATE = 'b'.repeat(64);

function configureLinear(): void {
  process.env['CONNECTOR_OAUTH_PROVIDERS_JSON'] = JSON.stringify({
    providers: [
      {
        connectorId: 'linear',
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        mcpUrl: 'https://mcp.example.com/mcp',
        scopes: ['read'],
      },
    ],
  });
  process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_ID'] = 'client-id-value';
  process.env['CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET'] = 'client-secret-value';
  __resetConnectorOAuthRegistryCacheForTests();
}

function pending(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    connectorId: 'linear',
    codeVerifier: 'verifier-value',
    redirectUri: REDIRECT_URI,
    requestedScopes: ['read'],
    returnPath: '/connectors',
    ...overrides,
  };
}

function request(query: string): NextRequest {
  return new NextRequest(`https://app.example.com/api/connectors/oauth/callback${query}`);
}

function location(response: Response): URL {
  return new URL(response.headers.get('location') as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authUser.mockResolvedValue({ userId: 'user-1' });
  mocks.upsertGrant.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
  for (const key of ENV_KEYS) delete process.env[key];
  process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'https://app.example.com';
  configureLinear();
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  __resetConnectorOAuthRegistryCacheForTests();
});

describe('GET /api/connectors/oauth/callback', () => {
  it('stores an encrypted grant and returns to the connectors surface', async () => {
    mocks.consumePending.mockResolvedValue(pending());
    mocks.exchange.mockResolvedValue({
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      tokenType: 'Bearer',
      accessTokenExpiresAt: new Date('2026-08-05T01:00:00.000Z'),
      grantedScopes: ['read'],
    });

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    expect(mocks.exchange).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'auth-code', codeVerifier: 'verifier-value' }),
    );
    expect(mocks.upsertGrant).toHaveBeenCalledWith(
      'user-1',
      'linear',
      expect.objectContaining({
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
        tokenEndpoint: 'https://auth.example.com/token',
      }),
    );
    const target = location(response);
    expect(target.pathname).toBe('/connectors');
    expect(target.searchParams.get('status')).toBe('connected');
    expect(target.searchParams.get('connector')).toBe('linear');
  });

  it('never reflects a token, code, or state into the response', async () => {
    mocks.consumePending.mockResolvedValue(pending());
    mocks.exchange.mockResolvedValue({
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      tokenType: 'Bearer',
      accessTokenExpiresAt: null,
      grantedScopes: ['read'],
    });

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    const body = await response.text();
    const serialized = `${body} ${response.headers.get('location')} ${JSON.stringify([
      ...response.headers.entries(),
    ])}`;
    for (const secret of ['access-token-value', 'refresh-token-value', 'auth-code', STATE]) {
      expect(serialized).not.toContain(secret);
    }
    const logged = JSON.stringify(mocks.warn.mock.calls);
    for (const secret of ['access-token-value', 'refresh-token-value', 'auth-code', STATE]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('rejects a state that is unknown, expired, or already consumed', async () => {
    mocks.consumePending.mockResolvedValue(null);

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    expect(location(response).searchParams.get('status')).toBe('invalid_state');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('rejects a malformed state before touching the store', async () => {
    const response = await GET(request('?state=short&code=auth-code'));

    expect(location(response).searchParams.get('status')).toBe('invalid_state');
    expect(mocks.consumePending).not.toHaveBeenCalled();
  });

  it('refuses to bind a grant when the callback arrives on a different account', async () => {
    mocks.consumePending.mockResolvedValue(pending({ userId: 'victim-user' }));

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    expect(location(response).searchParams.get('status')).toBe('invalid_state');
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.upsertGrant).not.toHaveBeenCalled();
  });

  it('consumes the state BEFORE a denial, so the callback cannot be replayed', async () => {
    mocks.consumePending.mockResolvedValue(pending());

    const response = await GET(request(`?state=${STATE}&error=access_denied`));

    expect(mocks.consumePending).toHaveBeenCalledTimes(1);
    expect(location(response).searchParams.get('status')).toBe('denied');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('refuses a redirect_uri this deployment no longer issues', async () => {
    mocks.consumePending.mockResolvedValue(
      pending({ redirectUri: 'https://old.example.com/api/connectors/oauth/callback' }),
    );

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    expect(location(response).searchParams.get('status')).toBe('unavailable');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('refuses when the provider was de-configured mid-flow', async () => {
    mocks.consumePending.mockResolvedValue(pending({ connectorId: 'notion' }));

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    expect(location(response).searchParams.get('status')).toBe('unavailable');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('reports a coarse failure when the token exchange is rejected', async () => {
    mocks.consumePending.mockResolvedValue(pending());
    mocks.exchange.mockRejectedValue(
      new mocks.ConnectorOAuthTokenError('bad', 400, 'invalid_grant'),
    );

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    expect(location(response).searchParams.get('status')).toBe('failed');
    expect(mocks.upsertGrant).not.toHaveBeenCalled();
  });

  it('honours a sanitized return path from the pending row', async () => {
    mocks.consumePending.mockResolvedValue(pending({ returnPath: '//evil.test' }));
    mocks.exchange.mockResolvedValue({
      accessToken: 'a',
      refreshToken: null,
      tokenType: 'Bearer',
      accessTokenExpiresAt: null,
      grantedScopes: [],
    });

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    const target = location(response);
    expect(target.origin).toBe('https://app.example.com');
    expect(target.pathname).toBe('/connectors');
  });

  it('refuses a stored return path the URL parser would collapse into another origin', async () => {
    mocks.consumePending.mockResolvedValue(pending({ returnPath: '/\t/evil.test' }));
    mocks.exchange.mockResolvedValue({
      accessToken: 'a',
      refreshToken: null,
      tokenType: 'Bearer',
      accessTokenExpiresAt: null,
      grantedScopes: [],
    });

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    const target = location(response);
    expect(target.origin).toBe('https://app.example.com');
    expect(target.pathname).toBe('/connectors');
  });

  it('sends a signed-out browser to login without consuming the state', async () => {
    mocks.authUser.mockRejectedValue(new Error('unauthenticated'));

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    expect(location(response).pathname).toBe('/login');
    expect(mocks.consumePending).not.toHaveBeenCalled();
  });
});
