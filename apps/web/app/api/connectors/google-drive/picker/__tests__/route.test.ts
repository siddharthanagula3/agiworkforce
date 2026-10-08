import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type OAuthAccessModule = typeof import('@/lib/connectors/oauth-access');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  resolveConnectorAccessToken: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<OAuthAccessModule>()),
  disconnectConnectorOAuthGrant: vi.fn(),
  resolveConnectorAccessToken: mocks.resolveConnectorAccessToken,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/connectors/google-drive/picker');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GOOGLE_PICKER_API_KEY', ' picker-key ');
  vi.stubEnv('GOOGLE_PICKER_APP_ID', '1234567890');
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1' });
  mocks.resolveConnectorAccessToken.mockResolvedValue({
    status: 'ready',
    accessToken: 'ya29.token',
  });
});

describe('GET /api/connectors/google-drive/picker', () => {
  it('returns the rate limiter answer', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.resolveConnectorAccessToken).not.toHaveBeenCalled();
  });

  it('reports not configured when the picker keys are missing', async () => {
    vi.stubEnv('GOOGLE_PICKER_APP_ID', '');

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'not-configured' });
    expect(mocks.resolveConnectorAccessToken).not.toHaveBeenCalled();
  });

  it('asks for a reconnect when the grant needs reauthorization', async () => {
    mocks.resolveConnectorAccessToken.mockResolvedValue({ status: 'reauthorization-required' });

    const response = await GET(request());

    expect(await response.json()).toEqual({ status: 'reconnect-required' });
  });

  it('says Drive could not be reached, not that it needs reconnecting, after a transient failure', async () => {
    mocks.resolveConnectorAccessToken.mockResolvedValue({ status: 'unreachable' });

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toBe(
      "Couldn't reach Google Drive just now. It is still connected, so try again in a moment.",
    );
  });

  it('reports not connected for any other token state', async () => {
    mocks.resolveConnectorAccessToken.mockResolvedValue({ status: 'missing' });

    const response = await GET(request());

    expect(await response.json()).toEqual({ status: 'not-connected' });
  });

  it('hands the caller their own Drive token and the picker keys, uncached', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'ready',
      accessToken: 'ya29.token',
      developerKey: 'picker-key',
      appId: '1234567890',
    });
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.resolveConnectorAccessToken).toHaveBeenCalledWith('user-1', 'google-drive');
  });
});
