import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  accountSecurityCaller: vi.fn(),
  completeHandoff: vi.fn(),
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
  sendEnrollmentCode: vi.fn(),
  startRecovery: vi.fn(),
  unavailableReason: vi.fn(),
  ACCOUNT_SECURITY_VERIFYING_SCOPE: {
    resolveOrganization: false,
    accountSecurityVerification: true,
  },
  accountSecurityCaller: mocks.accountSecurityCaller,
  completeHandoff: mocks.completeHandoff,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const scoped = { db: { query: vi.fn() }, userId: 'user-1', organizationId: null };
const caller = { ...scoped, sessionId: 'sess-1' };
const validBody = { handoff: 'h'.repeat(43), code: 'k'.repeat(43), codeVerifier: 'v'.repeat(64) };

function request(body: unknown): never {
  return new Request('http://localhost/api/account-security/handoff/completion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/account-security/handoff/completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue(scoped);
    mocks.accountSecurityCaller.mockResolvedValue(caller);
    mocks.completeHandoff.mockResolvedValue('2026-09-28T12:00:00.000Z');
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    expect(mocks.completeHandoff).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    expect(mocks.completeHandoff).not.toHaveBeenCalled();
  });

  it('rejects a code verifier that is too short with 400', async () => {
    const response = await POST(request({ ...validBody, codeVerifier: 'short' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'This sign-in could not be confirmed. Start again from the app.' },
    });
    expect(mocks.completeHandoff).not.toHaveBeenCalled();
  });

  it('completes the handoff for the caller and returns the verified window', async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      verifiedUntil: '2026-09-28T12:00:00.000Z',
    });
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'account-security-verify');
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
      accountSecurityVerification: true,
    });
    expect(mocks.completeHandoff).toHaveBeenCalledWith(caller, validBody, expect.anything());
  });

  it('maps a mismatched code to 400', async () => {
    mocks.completeHandoff.mockRejectedValue(
      createError.validation('This sign-in could not be confirmed. Start again from the app.'),
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
  });
});
