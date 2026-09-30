import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getClerkAuthUser: vi.fn(),
  isBlockedByMfaPolicy: vi.fn(),
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
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: mocks.getClerkAuthUser,
}));
vi.mock('@/lib/mfa-policy-gate', () => ({
  MfaRequiredError: class MfaRequiredError extends Error {},
  assertMfaPolicy: vi.fn(),
  isMfaRequiredError: vi.fn(),
  rememberMfaEnrollment: vi.fn(),
  resolveMfaEnrolled: vi.fn(),
  isBlockedByMfaPolicy: mocks.isBlockedByMfaPolicy,
}));

import { GET } from '../route';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/settings/2fa/requirement');
}

describe('GET /api/settings/2fa/requirement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.isBlockedByMfaPolicy).not.toHaveBeenCalled();
  });

  it('authenticates with the mfa enrollment scope so a blocked caller can still ask', async () => {
    mocks.isBlockedByMfaPolicy.mockResolvedValue(false);

    await GET(request());

    expect(mocks.getClerkAuthUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mfaEnrollment: true, resolveOrganization: false }),
    );
  });

  it.each([true, false])('reports required=%s for the caller', async (required) => {
    mocks.isBlockedByMfaPolicy.mockResolvedValue(required);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ required });
    expect(mocks.isBlockedByMfaPolicy).toHaveBeenCalledWith('user-1');
  });
});
