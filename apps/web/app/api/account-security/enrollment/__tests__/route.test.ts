import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  accountSecurityCaller: vi.fn(),
  prepareRecoveryKeys: vi.fn(),
  enrollAccountSecurity: vi.fn(),
  getNeonDb: vi.fn(),
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
  enrollAccountSecurity: mocks.enrollAccountSecurity,
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

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: mocks.getNeonDb,
  getStripeWebhookDb: vi.fn(),
}));

import { AppError, createError } from '@/lib/errors';
import { POST } from '../route';

const scoped = { db: { query: vi.fn() }, userId: 'user-1', organizationId: null };
const caller = { ...scoped, sessionId: 'sess-1' };
const ownerDb = { query: vi.fn() };
const recoveryBatchId = 'a'.repeat(43);
const body = { recoveryKeysSaved: true, recoveryBatchId, emailCode: '123456', response: { id: 'passkey' } };
const result = { enrolledAt: '2026-11-07T12:00:00.000Z', verifiedUntil: '2026-11-14T12:00:00.000Z', sessionsSignedOut: 1, devicesSignedOut: 0 };

function request(input: unknown = body): never {
  return new Request('http://localhost/api/account-security/enrollment', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue(scoped);
  mocks.accountSecurityCaller.mockResolvedValue(caller);
  mocks.getNeonDb.mockReturnValue(ownerDb);
  mocks.requireStepUp.mockResolvedValue({});
  mocks.enrollAccountSecurity.mockResolvedValue(result);
});

describe('enrollment recovery batch receipt', () => {
  it('passes the acknowledged batch and both proofs after step-up', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(result);
    expect(mocks.requireStepUp).toHaveBeenCalledWith(expect.objectContaining({
      userId: caller.userId, action: 'account_security.enroll', endpoint: '/api/account-security/enrollment',
    }));
    expect(mocks.enrollAccountSecurity).toHaveBeenCalledWith(caller, ownerDb, {
      recoveryBatchId, emailCode: body.emailCode, response: body.response,
    }, expect.anything());
    expect(mocks.requireStepUp.mock.invocationCallOrder[0]).toBeLessThan(mocks.enrollAccountSecurity.mock.invocationCallOrder[0]!);
  });

  it.each([undefined, null, '', 'legacy', 'a'.repeat(42), 'a'.repeat(44), '!'.repeat(43)])('rejects legacy or malformed receipt %s', async (batchId) => {
    const response = await POST(request({ ...body, recoveryBatchId: batchId }));
    expect(response.status).toBe(400);
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
    expect(mocks.enrollAccountSecurity).not.toHaveBeenCalled();
  });

  it('requires the saved acknowledgment as well as the receipt', async () => {
    expect((await POST(request({ ...body, recoveryKeysSaved: false }))).status).toBe(400);
    expect(mocks.enrollAccountSecurity).not.toHaveBeenCalled();
  });

  it('preserves CSRF, rate-limit, identity and step-up refusals', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await POST(request())).status).toBe(403);
    mocks.withRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await POST(request())).status).toBe(429);
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());
    expect((await POST(request())).status).toBe(401);
    mocks.requireStepUp.mockRejectedValueOnce(new AppError('STEP_UP_REQUIRED' as never, 'Confirm it is you.', 403));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.enrollAccountSecurity).not.toHaveBeenCalled();
  });

  it('returns a stale-batch conflict without retrying with a different receipt', async () => {
    mocks.enrollAccountSecurity.mockRejectedValueOnce(createError.conflict('Generate new recovery keys and request a new email code.'));
    expect((await POST(request())).status).toBe(409);
    expect(mocks.enrollAccountSecurity).toHaveBeenCalledTimes(1);
    expect(mocks.enrollAccountSecurity.mock.calls[0]?.[2]).toEqual({ recoveryBatchId, emailCode: body.emailCode, response: body.response });
  });
});
