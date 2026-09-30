import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  accountSecurityCaller: vi.fn(),
  sendEnrollmentCode: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
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
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/account-security/service', () => ({
  ACCOUNT_SECURITY_VERIFYING_SCOPE: vi.fn(),
  beginCredentialRegistration: vi.fn(),
  beginVerification: vi.fn(),
  callerIsEnrolled: vi.fn(),
  cancelPendingRecovery: vi.fn(),
  completeHandoff: vi.fn(),
  completeRecovery: vi.fn(),
  completeVerification: vi.fn(),
  confirmReplacementRecoveryKeys: vi.fn(),
  disableAccountSecurity: vi.fn(),
  enrollAccountSecurity: vi.fn(),
  finishCredentialRegistration: vi.fn(),
  openHandoff: vi.fn(),
  prepareRecoveryKeys: vi.fn(),
  readAccountSecurityStatus: vi.fn(),
  removeCredential: vi.fn(),
  startRecovery: vi.fn(),
  unavailableReason: vi.fn(),
  ACCOUNT_SECURITY_SCOPE: { resolveOrganization: false },
  accountSecurityCaller: mocks.accountSecurityCaller,
  sendEnrollmentCode: mocks.sendEnrollmentCode,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const scoped = { db: { query: vi.fn() }, userId: 'user-1', organizationId: null };
const caller = { ...scoped, sessionId: 'sess-1' };

function request(): never {
  return new Request('http://localhost/api/account-security/enrollment/code', {
    method: 'POST',
  }) as never;
}

describe('POST /api/account-security/enrollment/code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue(scoped);
    mocks.accountSecurityCaller.mockResolvedValue(caller);
    mocks.sendEnrollmentCode.mockResolvedValue({
      sentTo: 'u***@example.com',
      expiresAt: '2026-09-28T00:10:00.000Z',
    });
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.sendEnrollmentCode).not.toHaveBeenCalled();
  });

  it('uses the email rate limit bucket and honours it', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'account-security-email');
    expect(mocks.sendEnrollmentCode).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.sendEnrollmentCode).not.toHaveBeenCalled();
  });

  it('sends the code to the caller and returns 201 uncached', async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      sentTo: 'u***@example.com',
      expiresAt: '2026-09-28T00:10:00.000Z',
    });
    expect(mocks.sendEnrollmentCode).toHaveBeenCalledWith(caller);
  });

  it('maps an account that is already enrolled to 409', async () => {
    mocks.sendEnrollmentCode.mockRejectedValue(
      createError.conflict('Advanced Account Security is already on.'),
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'CONFLICT', message: 'Advanced Account Security is already on.' },
    });
  });
});
