import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  accountSecurityCaller: vi.fn(),
  callerIsEnrolled: vi.fn(),
  removeCredential: vi.fn(),
  requireStepUp: vi.fn(),
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
vi.mock('@/lib/server/step-up-auth', () => ({
  STEP_UP_TOKEN_HEADER: 'x-step-up-token',
  StepUpRequiredError: class StepUpRequiredError extends Error {},
  isStepUpRequiredError: vi.fn(),
  requireStepUp: mocks.requireStepUp,
}));
vi.mock('@/lib/server/account-security/service', () => ({
  ACCOUNT_SECURITY_VERIFYING_SCOPE: vi.fn(),
  beginCredentialRegistration: vi.fn(),
  beginVerification: vi.fn(),
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
  sendEnrollmentCode: vi.fn(),
  startRecovery: vi.fn(),
  unavailableReason: vi.fn(),
  ACCOUNT_SECURITY_SCOPE: { resolveOrganization: false },
  accountSecurityCaller: mocks.accountSecurityCaller,
  callerIsEnrolled: mocks.callerIsEnrolled,
  removeCredential: mocks.removeCredential,
}));

import { AppError, createError } from '@/lib/errors';
import { DELETE } from '../route';

const CREDENTIAL = 'cred-1';
const scoped = { db: { query: vi.fn() }, userId: 'user-1', organizationId: null };
const caller = { ...scoped, sessionId: 'sess-1' };
const context = { params: Promise.resolve({ credentialId: CREDENTIAL }) };

function request(): never {
  return new Request(`http://localhost/api/account-security/credentials/${CREDENTIAL}`, {
    method: 'DELETE',
  }) as never;
}

describe('DELETE /api/account-security/credentials/[credentialId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue(scoped);
    mocks.accountSecurityCaller.mockImplementation(async (_request, s) => ({
      ...s,
      sessionId: 'sess-1',
    }));
    mocks.callerIsEnrolled.mockResolvedValue(false);
    mocks.removeCredential.mockResolvedValue(undefined);
    mocks.requireStepUp.mockResolvedValue({});
  });

  it('refuses a request without a valid CSRF token before touching the account', async () => {
    mocks.requireCsrfToken.mockResolvedValue(
      new Response(JSON.stringify({ code: 'CSRF_VALIDATION_FAILED' }), { status: 403 }),
    );

    const response = await DELETE(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.removeCredential).not.toHaveBeenCalled();
  });

  it('returns the rate limit response when the caller is throttled', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await DELETE(request(), context);

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'account-security-write');
    expect(mocks.removeCredential).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await DELETE(request(), context);

    expect(response.status).toBe(401);
    expect(mocks.removeCredential).not.toHaveBeenCalled();
  });

  it('refuses a caller with no browser or app session', async () => {
    mocks.accountSecurityCaller.mockRejectedValue(
      createError
        .forbidden('Advanced Account Security is managed from a signed-in browser or app.')
        .asUserSafe(),
    );

    const response = await DELETE(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.removeCredential).not.toHaveBeenCalled();
  });

  it('removes the credential without step-up when the account is not enrolled', async () => {
    const response = await DELETE(request(), context);

    expect(response.status).toBe(204);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
    expect(mocks.removeCredential).toHaveBeenCalledWith(caller, CREDENTIAL, expect.anything());
  });

  it('requires step-up for the credential when the account is enrolled', async () => {
    mocks.callerIsEnrolled.mockResolvedValue(true);

    const response = await DELETE(request(), context);

    expect(response.status).toBe(204);
    expect(mocks.requireStepUp).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'account_security.change',
        resourceId: CREDENTIAL,
        endpoint: '/api/account-security/credentials',
      }),
    );
  });

  it('does not remove the credential when step-up is refused', async () => {
    mocks.callerIsEnrolled.mockResolvedValue(true);
    mocks.requireStepUp.mockRejectedValue(
      new AppError('STEP_UP_REQUIRED' as never, 'Confirm it is you.', 403),
    );

    const response = await DELETE(request(), context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'STEP_UP_REQUIRED' },
    });
    expect(mocks.removeCredential).not.toHaveBeenCalled();
  });

  it('maps a missing credential to 404 with the service message', async () => {
    mocks.removeCredential.mockRejectedValue(
      createError.notFound('That passkey or security key was not found.').asUserSafe(),
    );

    const response = await DELETE(request(), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND', message: 'That passkey or security key was not found.' },
    });
  });

  it('maps removing the last key while enrolled to 409', async () => {
    mocks.removeCredential.mockRejectedValue(
      createError.conflict('Add another passkey or security key before removing this one.'),
    );

    const response = await DELETE(request(), context);

    expect(response.status).toBe(409);
  });
});
