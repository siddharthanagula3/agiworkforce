import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  accountSecurityCaller: vi.fn(),
  completeVerification: vi.fn(),
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
  ACCOUNT_SECURITY_SCOPE: vi.fn(),
  beginCredentialRegistration: vi.fn(),
  beginVerification: vi.fn(),
  callerIsEnrolled: vi.fn(),
  cancelPendingRecovery: vi.fn(),
  completeHandoff: vi.fn(),
  completeRecovery: vi.fn(),
  confirmReplacementRecoveryKeys: vi.fn(),
  disableAccountSecurity: vi.fn(),
  enrollAccountSecurity: vi.fn(),
  finishCredentialRegistration: vi.fn(),
  openHandoff: vi.fn(),
  prepareRecoveryKeys: vi.fn(),
  readAccountSecurityStatus: vi.fn(),
  removeCredential: vi.fn(),
  sendEnrollmentCode: vi.fn(),
  startRecovery: vi.fn(),
  unavailableReason: vi.fn(),
  ACCOUNT_SECURITY_VERIFYING_SCOPE: {
    resolveOrganization: false,
    accountSecurityVerification: true,
  },
  accountSecurityCaller: mocks.accountSecurityCaller,
  completeVerification: mocks.completeVerification,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const scoped = { db: { query: vi.fn() }, userId: 'user-1', organizationId: null };
const caller = { ...scoped, sessionId: 'sess-1' };
const assertion = { id: 'raw-id', type: 'public-key' };

function request(body: unknown): never {
  return new Request('http://localhost/api/account-security/verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/account-security/verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue(scoped);
    mocks.accountSecurityCaller.mockResolvedValue(caller);
    mocks.completeVerification.mockResolvedValue('2026-09-28T12:00:00.000Z');
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request({ response: assertion }));

    expect(response.status).toBe(403);
    expect(mocks.completeVerification).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(request({ response: assertion }));

    expect(response.status).toBe(401);
    expect(mocks.completeVerification).not.toHaveBeenCalled();
  });

  it('refuses a caller with no browser or app session', async () => {
    mocks.accountSecurityCaller.mockRejectedValue(
      createError
        .forbidden('Advanced Account Security is managed from a signed-in browser or app.')
        .asUserSafe(),
    );

    const response = await POST(request({ response: assertion }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Advanced Account Security is managed from a signed-in browser or app.' },
    });
    expect(mocks.completeVerification).not.toHaveBeenCalled();
  });

  it('rejects a body with extra fields with 400', async () => {
    const response = await POST(request({ response: assertion, userId: 'someone-else' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Use one of your passkeys or security keys.' },
    });
    expect(mocks.completeVerification).not.toHaveBeenCalled();
  });

  it('verifies the caller and returns the verified window', async () => {
    const response = await POST(request({ response: assertion }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      verifiedUntil: '2026-09-28T12:00:00.000Z',
    });
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'account-security-verify');
    expect(mocks.completeVerification).toHaveBeenCalledWith(caller, assertion, expect.anything());
  });

  it('maps an expired ceremony to 409', async () => {
    mocks.completeVerification.mockRejectedValue(
      createError.conflict('This request expired. Try your passkey or security key again.'),
    );

    const response = await POST(request({ response: assertion }));

    expect(response.status).toBe(409);
  });
});
