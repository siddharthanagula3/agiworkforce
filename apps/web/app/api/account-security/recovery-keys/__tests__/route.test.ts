import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  accountSecurityCaller: vi.fn(),
  prepareRecoveryKeys: vi.fn(),
  confirmReplacementRecoveryKeys: vi.fn(),
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
  callerIsEnrolled: vi.fn(),
  cancelPendingRecovery: vi.fn(),
  completeHandoff: vi.fn(),
  completeRecovery: vi.fn(),
  completeVerification: vi.fn(),
  disableAccountSecurity: vi.fn(),
  enrollAccountSecurity: vi.fn(),
  finishCredentialRegistration: vi.fn(),
  openHandoff: vi.fn(),
  readAccountSecurityStatus: vi.fn(),
  removeCredential: vi.fn(),
  sendEnrollmentCode: vi.fn(),
  startRecovery: vi.fn(),
  unavailableReason: vi.fn(),
  ACCOUNT_SECURITY_SCOPE: { resolveOrganization: false },
  accountSecurityCaller: mocks.accountSecurityCaller,
  prepareRecoveryKeys: mocks.prepareRecoveryKeys,
  confirmReplacementRecoveryKeys: mocks.confirmReplacementRecoveryKeys,
}));

import { AppError, createError } from '@/lib/errors';
import { POST, PUT } from '../route';

const scoped = { db: { query: vi.fn() }, userId: 'user-1', organizationId: null };
const caller = { ...scoped, sessionId: 'sess-1' };

function request(method: string, body?: unknown): never {
  return new Request('http://localhost/api/account-security/recovery-keys', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

describe('/api/account-security/recovery-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue(scoped);
    mocks.accountSecurityCaller.mockResolvedValue(caller);
    mocks.requireStepUp.mockResolvedValue({});
    mocks.prepareRecoveryKeys.mockResolvedValue({ keys: ['AAAA-BBBB', 'CCCC-DDDD'] });
    mocks.confirmReplacementRecoveryKeys.mockResolvedValue(undefined);
  });

  describe('POST prepares recovery keys', () => {
    it('refuses a request without a valid CSRF token', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await POST(request('POST'));

      expect(response.status).toBe(403);
      expect(mocks.prepareRecoveryKeys).not.toHaveBeenCalled();
    });

    it('refuses an unauthenticated caller with 401', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

      const response = await POST(request('POST'));

      expect(response.status).toBe(401);
      expect(mocks.prepareRecoveryKeys).not.toHaveBeenCalled();
    });

    it('returns the caller keys uncached', async () => {
      const response = await POST(request('POST'));

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      await expect(response.json()).resolves.toEqual({ keys: ['AAAA-BBBB', 'CCCC-DDDD'] });
      expect(mocks.prepareRecoveryKeys).toHaveBeenCalledWith(caller);
    });
  });

  describe('PUT confirms replacement keys', () => {
    it('refuses a request without a valid CSRF token', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await PUT(request('PUT', { recoveryKeysSaved: true }));

      expect(response.status).toBe(403);
      expect(mocks.confirmReplacementRecoveryKeys).not.toHaveBeenCalled();
    });

    it('refuses an unauthenticated caller with 401', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

      const response = await PUT(request('PUT', { recoveryKeysSaved: true }));

      expect(response.status).toBe(401);
      expect(mocks.confirmReplacementRecoveryKeys).not.toHaveBeenCalled();
    });

    it('rejects a body that does not confirm the keys were saved', async () => {
      const response = await PUT(request('PUT', { recoveryKeysSaved: false }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { message: 'Confirm that you saved your new recovery keys.' },
      });
      expect(mocks.requireStepUp).not.toHaveBeenCalled();
      expect(mocks.confirmReplacementRecoveryKeys).not.toHaveBeenCalled();
    });

    it('does not replace the keys when step-up is refused', async () => {
      mocks.requireStepUp.mockRejectedValue(
        new AppError('STEP_UP_REQUIRED' as never, 'Confirm it is you.', 403),
      );

      const response = await PUT(request('PUT', { recoveryKeysSaved: true }));

      expect(response.status).toBe(403);
      expect(mocks.confirmReplacementRecoveryKeys).not.toHaveBeenCalled();
    });

    it('replaces the keys for the caller after step-up', async () => {
      const response = await PUT(request('PUT', { recoveryKeysSaved: true }));

      expect(response.status).toBe(204);
      expect(mocks.requireStepUp).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'account_security.change',
          endpoint: '/api/account-security/recovery-keys',
        }),
      );
      expect(mocks.confirmReplacementRecoveryKeys).toHaveBeenCalledWith(caller, expect.anything());
    });

    it('maps keys that were never prepared to 409', async () => {
      mocks.confirmReplacementRecoveryKeys.mockRejectedValue(
        createError.conflict('Create new recovery keys first.'),
      );

      const response = await PUT(request('PUT', { recoveryKeysSaved: true }));

      expect(response.status).toBe(409);
    });
  });
});
