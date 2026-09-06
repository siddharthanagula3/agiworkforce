import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authUser: vi.fn(),
  begin: vi.fn(),
  target: null as Record<string, unknown> | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  ConnectorOAuthStoreUnavailableError: class extends Error {},
  createPendingAuthorization: vi.fn(),
  upsertConnectorOAuthGrant: vi.fn(),
}));
vi.mock('@/lib/connectors/mcp-discovery', () => ({
  beginMcpAuthorization: (...a: unknown[]) => mocks.begin(...a),
}));
vi.mock('@/lib/connectors/mcp-directory-targets', () => ({
  resolveDirectoryTarget: async () => mocks.target,
}));

import { GET } from './route';
import { __resetConnectorOAuthRegistryCacheForTests } from '@/lib/connectors/oauth-registry';

const RECORD_ID = 'ch.cowork24/booking';
const ENCODED_ID = encodeURIComponent(RECORD_ID);

function request(query: string): NextRequest {
  return new NextRequest(`https://app.example.com/api/connectors/oauth/start${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authUser.mockResolvedValue({ userId: 'user-1' });
  mocks.target = {
    connectorId: RECORD_ID,
    serverId: 'dir-0123456789ab',
    mcpUrl: 'https://mcp.cowork24.ch/mcp',
    transport: 'streamable-http',
    name: 'Cowork24',
    documentationUrl: 'https://cowork24.ch/docs/mcp',
  };
  process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] = 'https://app.example.com';
  __resetConnectorOAuthRegistryCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'];
  __resetConnectorOAuthRegistryCacheForTests();
});

describe('GET /api/connectors/oauth/start for a directory record', () => {
  it('runs discovery against the record remote under the record id', async () => {
    mocks.begin.mockResolvedValue({
      status: 'redirect',
      authorizationUrl: 'https://mcp.cowork24.ch/authorize?client_id=registered',
      state: 'a'.repeat(64),
    });

    const response = await GET(request(`?connectorId=${ENCODED_ID}&returnPath=%2Fsettings`));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://mcp.cowork24.ch/authorize?client_id=registered',
    );
    expect(mocks.begin).toHaveBeenCalledWith({
      userId: 'user-1',
      connectorId: RECORD_ID,
      mcpUrl: 'https://mcp.cowork24.ch/mcp',
      returnPath: '/settings',
    });
  });

  it('returns the user with one sentence naming the server when registration is refused', async () => {
    mocks.begin.mockResolvedValue({
      status: 'error',
      reason: 'registration-rejected',
      message: 'The provider refused to register this application.',
    });

    const redirect = await GET(request(`?connectorId=${ENCODED_ID}`));
    const location = new URL(redirect.headers.get('location') as string);
    expect(location.pathname).toBe('/connectors');
    expect(location.searchParams.get('status')).toBe('registration_rejected');
    expect(location.searchParams.get('connector')).toBe(RECORD_ID);

    const json = await GET(request(`?connectorId=${ENCODED_ID}&mode=json`));
    expect(json.status).toBe(502);
    await expect(json.json()).resolves.toMatchObject({
      status: 'registration_rejected',
      message: 'Cowork24 refused to register this app, so it cannot be connected here.',
      connectorName: 'Cowork24',
      documentationUrl: 'https://cowork24.ch/docs/mcp',
    });
  });

  it('names the callback origin variable when the deployment cannot receive a callback', async () => {
    mocks.begin.mockResolvedValue({
      status: 'error',
      reason: 'no-client-identity',
      message: 'no public origin',
    });
    vi.stubEnv('CONNECTOR_OAUTH_REDIRECT_BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');

    const response = await GET(request(`?connectorId=${ENCODED_ID}&mode=json`));

    await expect(response.json()).resolves.toMatchObject({
      status: 'not_configured',
      message: expect.stringContaining('CONNECTOR_OAUTH_REDIRECT_BASE_URL'),
    });
  });

  it('reports an open server instead of sending the user through a consent screen', async () => {
    mocks.begin.mockResolvedValue({ status: 'no-authorization-required' });

    const response = await GET(request(`?connectorId=${ENCODED_ID}&mode=json`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'open' });
  });

  it('still refuses an id the directory does not know', async () => {
    mocks.target = null;

    const response = await GET(request('?connectorId=unknown%2Fthing&mode=json'));

    expect(response.status).toBe(501);
    expect(mocks.begin).not.toHaveBeenCalled();
  });
});
