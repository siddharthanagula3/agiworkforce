import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_SECURITY_POLICY } from '@agiworkforce/cloud-contracts/account-security';

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
    mocks.accountSecurityCaller.mockResolvedValue(caller);
    mocks.callerIsEnrolled.mockResolvedValue(false);
    mocks.removeCredential.mockResolvedValue(undefined);
    mocks.requireStepUp.mockResolvedValue({});
  });

  it('refuses a request without a valid CSRF token before touching the account', async () => {
    const incoming = request();
    const denial = new Response(JSON.stringify({ code: 'CSRF_VALIDATION_FAILED' }), { status: 403 });
    mocks.requireCsrfToken.mockResolvedValue(denial);

    const response = await DELETE(incoming, context);

    expect(response).toBe(denial);
    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(incoming);
    expect(mocks.withRateLimit).not.toHaveBeenCalled();
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.accountSecurityCaller).not.toHaveBeenCalled();
    expect(mocks.removeCredential).not.toHaveBeenCalled();
  });

  it('returns the rate limit response when the caller is throttled', async () => {
    const incoming = request();
    const denial = new Response(null, { status: 429, headers: { 'retry-after': '60' } });
    mocks.withRateLimit.mockResolvedValue(denial);

    const response = await DELETE(incoming, context);

    expect(response).toBe(denial);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(mocks.withRateLimit).toHaveBeenCalledWith(incoming, 'account-security-write');
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.accountSecurityCaller).not.toHaveBeenCalled();
    expect(mocks.removeCredential).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await DELETE(request(), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    expect(mocks.accountSecurityCaller).not.toHaveBeenCalled();
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

  it.each([false, true])(
    'delegates admission to the service without consulting route enrollment state (%s)',
    async (enrolled) => {
      mocks.callerIsEnrolled.mockResolvedValue(enrolled);
      const incoming = request();

      const response = await DELETE(incoming, context);

      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe('');
      expect(mocks.requireCsrfToken).toHaveBeenCalledWith(incoming);
      expect(mocks.withRateLimit).toHaveBeenCalledWith(incoming, 'account-security-write');
      expect(mocks.getUserScopedDb).toHaveBeenCalledWith(incoming, {
        resolveOrganization: false,
      });
      expect(mocks.accountSecurityCaller).toHaveBeenCalledWith(incoming, scoped);
      expect(mocks.callerIsEnrolled).not.toHaveBeenCalled();
      expect(mocks.requireStepUp).not.toHaveBeenCalled();
      expect(mocks.removeCredential).toHaveBeenCalledExactlyOnceWith(caller, CREDENTIAL, incoming);
      expect(mocks.removeCredential.mock.calls[0]?.[0]).toBe(caller);
      expect(mocks.removeCredential.mock.calls[0]?.[2]).toBe(incoming);
    },
  );

  it('passes the resolved route credential ID without replacing it from the request URL', async () => {
    const incoming = request();
    const credentialId = 'cred-other';

    const response = await DELETE(incoming, { params: Promise.resolve({ credentialId }) });

    expect(response.status).toBe(204);
    expect(mocks.removeCredential).toHaveBeenCalledExactlyOnceWith(caller, credentialId, incoming);
  });

  it('propagates the service step-up denial through the default error handler', async () => {
    const incoming = request();
    const details = {
      reason: 'step_up_required',
      action: 'account_security.change',
      cause: 'missing',
    };
    mocks.removeCredential.mockRejectedValue(
      new AppError(
        'STEP_UP_REQUIRED',
        'Confirm it is you before completing this action.',
        403,
        details,
      ),
    );

    const response = await DELETE(incoming, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'STEP_UP_REQUIRED',
        message: 'Confirm it is you before completing this action.',
        details,
      },
    });
    expect(mocks.removeCredential).toHaveBeenCalledExactlyOnceWith(caller, CREDENTIAL, incoming);
    expect(mocks.callerIsEnrolled).not.toHaveBeenCalled();
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
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
    const message = `Keep at least ${ACCOUNT_SECURITY_POLICY.minimumSignInMethods} passkeys or security keys, including one that works across devices. Add another one before removing this one.`;
    mocks.removeCredential.mockRejectedValue(createError.conflict(message));

    const response = await DELETE(request(), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'CONFLICT',
        message,
      },
    });
  });

  it('preserves the default generic response for unexpected service failures', async () => {
    mocks.removeCredential.mockRejectedValue(new Error('private database failure'));

    const response = await DELETE(request(), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });
});
