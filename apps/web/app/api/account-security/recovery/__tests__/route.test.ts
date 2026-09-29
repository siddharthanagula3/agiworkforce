import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  accountSecurityCaller: vi.fn(),
  startRecovery: vi.fn(),
  completeRecovery: vi.fn(),
  cancelPendingRecovery: vi.fn(),
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
  beginCredentialRegistration: vi.fn(),
  beginVerification: vi.fn(),
  callerIsEnrolled: vi.fn(),
  completeHandoff: vi.fn(),
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
  unavailableReason: vi.fn(),
  ACCOUNT_SECURITY_SCOPE: { resolveOrganization: false },
  ACCOUNT_SECURITY_VERIFYING_SCOPE: {
    resolveOrganization: false,
    accountSecurityVerification: true,
  },
  accountSecurityCaller: mocks.accountSecurityCaller,
  startRecovery: mocks.startRecovery,
  completeRecovery: mocks.completeRecovery,
  cancelPendingRecovery: mocks.cancelPendingRecovery,
}));

import { createError } from '@/lib/errors';
import { DELETE, POST, PUT } from '../route';

const scoped = { db: { query: vi.fn() }, userId: 'user-1', organizationId: null };
const caller = { ...scoped, sessionId: 'sess-1' };
const VERIFYING = { resolveOrganization: false, accountSecurityVerification: true };
const hold = {
  startedAt: '2026-09-28T00:00:00.000Z',
  unlocksAt: '2026-09-29T00:00:00.000Z',
  startedOnThisSession: true,
};

function request(method: string, body?: unknown): never {
  return new Request('http://localhost/api/account-security/recovery', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

describe('/api/account-security/recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue(scoped);
    mocks.accountSecurityCaller.mockResolvedValue(caller);
    mocks.startRecovery.mockResolvedValue(hold);
    mocks.completeRecovery.mockResolvedValue('2026-09-29T12:00:00.000Z');
    mocks.cancelPendingRecovery.mockResolvedValue(undefined);
  });

  describe('POST starts a recovery', () => {
    it('refuses a request without a valid CSRF token', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await POST(request('POST', { recoveryKey: 'ABCD-EFGH' }));

      expect(response.status).toBe(403);
      expect(mocks.startRecovery).not.toHaveBeenCalled();
    });

    it('refuses an unauthenticated caller with 401', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

      const response = await POST(request('POST', { recoveryKey: 'ABCD-EFGH' }));

      expect(response.status).toBe(401);
      expect(mocks.startRecovery).not.toHaveBeenCalled();
    });

    it('rejects an empty recovery key with 400', async () => {
      const response = await POST(request('POST', { recoveryKey: '   ' }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { message: 'Enter one of your recovery keys.' },
      });
      expect(mocks.startRecovery).not.toHaveBeenCalled();
    });

    it('starts the hold for the caller under the recovery rate limit', async () => {
      const response = await POST(request('POST', { recoveryKey: 'ABCD-EFGH' }));

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ recovery: hold });
      expect(mocks.withRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'account-security-recovery',
      );
      expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), VERIFYING);
      expect(mocks.startRecovery).toHaveBeenCalledWith(caller, 'ABCD-EFGH', expect.anything());
    });

    it('maps an invalid or used recovery key to 400', async () => {
      mocks.startRecovery.mockRejectedValue(
        createError.validation('That recovery key is not valid, or it was already used.'),
      );

      const response = await POST(request('POST', { recoveryKey: 'ABCD-EFGH' }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { message: 'That recovery key is not valid, or it was already used.' },
      });
    });
  });

  describe('PUT completes a recovery', () => {
    it('refuses a request without a valid CSRF token', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await PUT(request('PUT'));

      expect(response.status).toBe(403);
      expect(mocks.completeRecovery).not.toHaveBeenCalled();
    });

    it('refuses an unauthenticated caller with 401', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

      const response = await PUT(request('PUT'));

      expect(response.status).toBe(401);
      expect(mocks.completeRecovery).not.toHaveBeenCalled();
    });

    it('returns the verified window for the caller', async () => {
      const response = await PUT(request('PUT'));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        verifiedUntil: '2026-09-29T12:00:00.000Z',
      });
      expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), VERIFYING);
      expect(mocks.completeRecovery).toHaveBeenCalledWith(caller, expect.anything());
    });

    it('maps a hold that has not unlocked to 409', async () => {
      mocks.completeRecovery.mockRejectedValue(
        createError.conflict('Your recovery is still waiting. Come back when it unlocks.'),
      );

      const response = await PUT(request('PUT'));

      expect(response.status).toBe(409);
    });
  });

  describe('DELETE cancels a pending recovery', () => {
    it('refuses a request without a valid CSRF token', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await DELETE(request('DELETE'));

      expect(response.status).toBe(403);
      expect(mocks.cancelPendingRecovery).not.toHaveBeenCalled();
    });

    it('refuses an unauthenticated caller with 401', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

      const response = await DELETE(request('DELETE'));

      expect(response.status).toBe(401);
      expect(mocks.cancelPendingRecovery).not.toHaveBeenCalled();
    });

    it('cancels under the full account scope, not the verifying one', async () => {
      const response = await DELETE(request('DELETE'));

      expect(response.status).toBe(204);
      expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
        resolveOrganization: false,
      });
      expect(mocks.cancelPendingRecovery).toHaveBeenCalledWith(caller, expect.anything());
    });

    it('maps no pending recovery to 409', async () => {
      mocks.cancelPendingRecovery.mockRejectedValue(
        createError.conflict('There is no recovery waiting to be cancelled.'),
      );

      const response = await DELETE(request('DELETE'));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'CONFLICT', message: 'There is no recovery waiting to be cancelled.' },
      });
    });
  });
});
