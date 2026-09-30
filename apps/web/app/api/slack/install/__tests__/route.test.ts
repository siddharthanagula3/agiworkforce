import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  isAuthGateRefusal: vi.fn(),
  unauthorizedResponseFor: vi.fn(),
  withRateLimit: vi.fn(),
  cookieSet: vi.fn(),
  slackAppOrigin: vi.fn(),
  slackAppCredentials: vi.fn(),
  isSlackAppConfigured: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: mocks.cookieSet })) }));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: mocks.getClerkAuthUser,
}));
vi.mock('@/lib/api-auth-response', () => ({
  isAuthGateRefusal: mocks.isAuthGateRefusal,
  unauthorizedResponseFor: mocks.unauthorizedResponseFor,
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
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/slack/slack-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/slack/slack-config')>()),
  slackAppOrigin: mocks.slackAppOrigin,
  slackAppCredentials: mocks.slackAppCredentials,
  isSlackAppConfigured: mocks.isSlackAppConfigured,
}));

import { GET } from '../route';

const ORIGIN = 'https://app.example.com';

function request(): NextRequest {
  return new NextRequest('https://app.example.com/api/slack/install');
}

describe('GET /api/slack/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.isAuthGateRefusal.mockReturnValue(false);
    mocks.slackAppOrigin.mockReturnValue(ORIGIN);
    mocks.slackAppCredentials.mockReturnValue({ clientId: 'client-1', clientSecret: 'secret' });
    mocks.isSlackAppConfigured.mockReturnValue(true);
  });

  it('returns the rate limit response before authenticating', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('redirects a signed out browser to login and sets no state', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(new Error('no session'));
    const response = await GET(request());
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('redirectTo')).toBe('/chat?settings=slack');
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('answers an auth gate refusal with the gate response', async () => {
    const gate = new Error('mfa required');
    mocks.getClerkAuthUser.mockRejectedValue(gate);
    mocks.isAuthGateRefusal.mockReturnValue(true);
    mocks.unauthorizedResponseFor.mockReturnValue(
      NextResponse.json({ error: 'mfa' }, { status: 403 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.unauthorizedResponseFor).toHaveBeenCalledWith(gate);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('sends the user back to settings as unavailable when Slack is not configured', async () => {
    mocks.isSlackAppConfigured.mockReturnValue(false);
    const response = await GET(request());
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe(ORIGIN);
    expect(location.searchParams.get('slack')).toBe('unavailable');
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('binds a fresh state to the caller and redirects to Slack authorize', async () => {
    const response = await GET(request());
    expect(response.status).toBe(307);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const target = new URL(response.headers.get('location') ?? '');
    expect(`${target.origin}${target.pathname}`).toBe('https://slack.com/oauth/v2/authorize');
    expect(target.searchParams.get('client_id')).toBe('client-1');
    expect(target.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/slack/oauth/callback`);
    const state = target.searchParams.get('state') ?? '';
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'slack_install_state',
        value: `${state}.user-1`,
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/slack/oauth/callback',
      }),
    );
  });
});
