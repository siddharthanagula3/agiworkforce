import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { IdentityUser } from '@agiworkforce/identity';
type SessionProofModule = typeof import('@/lib/server/step-up/session-proof');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getNeonDb: vi.fn(),
  claimScope: vi.fn(),
  resolveOrganization: vi.fn(),
  query: vi.fn(),
  getUser: vi.fn(),
  registerSecondFactor: vi.fn(),
  rememberEnrollment: vi.fn(),
  readSessionFactorAge: vi.fn(),
  recordAuditEvent: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mocks.authenticate,
  getClerkAuthorizedParties: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  assertAccountActive: vi.fn(),
  getCookieSessionAuthUser: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: mocks.getNeonDb,
  getStripeWebhookDb: vi.fn(),
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: mocks.claimScope,
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  resolveActiveOrganizationId: mocks.resolveOrganization,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  SECURITY_EVENT_ACTIVITY_REDIS_KEY: 'agi-security-audit:pending-anomaly-check',
  BLOCK_APPEAL_PATH: '/support',
  consumePendingSecurityAnomalyCheck: vi.fn(),
  logSecurityEvent: vi.fn(),
  getClientIp: vi.fn(),
  logAuthFailure: vi.fn(),
  logRateLimitExceeded: vi.fn(),
  logCsrfFailure: vi.fn(),
  logInvalidSignature: vi.fn(),
  auditRetentionClassFor: vi.fn(),
  auditEnvelopeFields: vi.fn(),
  sanitizeAuditDetail: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getIdentityUser: vi.fn(),
  getIdentityProvider: () => ({
    getUser: mocks.getUser,
    registerSecondFactor: mocks.registerSecondFactor,
  }),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
}));
vi.mock('@/lib/mfa-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule4>()),
  rememberMfaEnrollment: mocks.rememberEnrollment,
}));
vi.mock('@/lib/server/step-up/session-proof', async (importOriginal) => ({
  ...(await importOriginal<SessionProofModule>()),
  readSessionFactorAge: mocks.readSessionFactorAge,
}));

process.env['CSRF_SECRET'] = 'step-up-route-secret-that-is-long-enough';

import { createError } from '@/lib/errors';
import { GET, POST } from '../route';
import { verifyStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';

const ACCOUNT = 'product-account-7';
const SUBJECT = 'native-subject-9';
const SESSION = 'sess_native_9';
const ORG = '11111111-1111-4111-8111-111111111111';
const DB = { query: mocks.query };
const SERVICE_DB = { query: vi.fn(), withUser: vi.fn() };

function providerUser(
  secondFactor = true,
): Pick<IdentityUser, 'id' | 'totpEnabled' | 'twoFactorEnabled' | 'backupCodesEnabled'> {
  return {
    id: SUBJECT,
    totpEnabled: secondFactor,
    twoFactorEnabled: secondFactor,
    backupCodesEnabled: secondFactor,
  };
}

function request(method: 'GET' | 'POST', body?: unknown, bearer = true) {
  return new NextRequest('http://localhost:3000/api/auth/step-up', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(bearer
        ? { authorization: 'Bearer native-session-token' }
        : { cookie: '__session=native-cookie' }),
      'x-user-id': 'forged-account',
      'x-session-id': 'forged-session',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetStepUpSigningKeyCache();
  mocks.authenticate.mockResolvedValue({
    userId: ACCOUNT,
    sessionIdentity: { subject: SUBJECT, sessionId: SESSION },
  });
  mocks.getNeonDb.mockReturnValue(SERVICE_DB);
  mocks.claimScope.mockReturnValue(DB);
  mocks.query.mockResolvedValue([]);
  mocks.getUser.mockResolvedValue(providerUser());
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.readSessionFactorAge.mockResolvedValue({ firstFactorMinutes: 30, secondFactorMinutes: 0 });
});

describe('POST /api/auth/step-up', () => {
  it.each([true, false])(
    'mints product-account proof using native factors, bearer=%s',
    async (bearer) => {
      const incoming = request(
        'POST',
        { action: 'organization.transfer_ownership', resourceId: ORG },
        bearer,
      );

      const response = await POST(incoming);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { token: string; method: string };
      expect(body.method).toBe('second_factor');
      expect(
        verifyStepUpGrant(body.token, {
          userId: ACCOUNT,
          action: 'organization.transfer_ownership',
          resourceId: ORG,
        }).method,
      ).toBe('second_factor');
      expect(() =>
        verifyStepUpGrant(body.token, {
          userId: SUBJECT,
          action: 'organization.transfer_ownership',
          resourceId: ORG,
        }),
      ).toThrow();
      expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith(incoming, {
        mfaEnrollment: true,
        resolveOrganization: false,
      });
      expect(mocks.claimScope).toHaveBeenCalledExactlyOnceWith(SERVICE_DB, {
        userId: ACCOUNT,
        organizationId: null,
      });
      expect(mocks.resolveOrganization).not.toHaveBeenCalled();
      expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(SUBJECT);
      expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('from user_two_factor'), [
        ACCOUNT,
      ]);
      expect(mocks.withRateLimit).toHaveBeenCalledWith(incoming, 'auth-verify', `user:${ACCOUNT}`);
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'step_up_satisfied',
          userId: ACCOUNT,
          organizationId: null,
          detail: {
            resourceType: 'step_up',
            resourceId: 'organization.transfer_ownership',
            source: 'second_factor',
            scope: ORG,
          },
        }),
      );
    },
  );

  it('requires a recent second factor even when the first factor was freshly verified', async () => {
    mocks.readSessionFactorAge.mockResolvedValue({
      firstFactorMinutes: 0,
      secondFactorMinutes: 45,
    });

    const response = await POST(request('POST', { action: 'email.change' }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.token).toBeUndefined();
    expect(body.error.code).toBe('STEP_UP_VERIFICATION_REQUIRED');
    expect(body.error.details.level).toBe('second_factor');
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('accepts a recent first factor only after reading the matching unenrolled provider user', async () => {
    mocks.getUser.mockResolvedValue(providerUser(false));
    mocks.readSessionFactorAge.mockResolvedValue({
      firstFactorMinutes: 1,
      secondFactorMinutes: null,
    });

    const response = await POST(request('POST', { action: 'account.delete' }));

    expect(response.status).toBe(200);
    expect((await response.json()).method).toBe('first_factor');
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(SUBJECT);
  });

  it('returns a CSRF refusal before resolving an account or reading factors', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({}, { status: 403 }));

    expect((await POST(request('POST', { action: 'email.change' }))).status).toBe(403);

    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('rate-limits the product account before reading provider factors or minting a grant', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));

    expect((await POST(request('POST', { action: 'email.change' }))).status).toBe(429);

    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'auth-verify',
      `user:${ACCOUNT}`,
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'settings.rename_workspace' },
    { action: 'email.change', userId: 'forged-account', subject: 'forged-subject' },
  ])('refuses an invalid action or client identity fields: %j', async (body) => {
    const response = await POST(request('POST', body));

    expect(response.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.readSessionFactorAge).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/step-up', () => {
  it('reports native factors without an extra workspace lookup after canonical authentication', async () => {
    mocks.getUser.mockResolvedValue(providerUser(false));

    const response = await GET(request('GET'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.level).toBe('first_factor');
    expect(body.actions['organization.transfer_ownership']?.freshnessSeconds).toBe(300);
    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(SUBJECT);
    expect(mocks.resolveOrganization).not.toHaveBeenCalled();
    expect(mocks.readSessionFactorAge).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe.each(['GET', 'POST'] as const)('%s /api/auth/step-up admission failures', (method) => {
  const call = () =>
    method === 'GET' ? GET(request('GET')) : POST(request('POST', { action: 'email.change' }));

  it.each([null, { ...providerUser(false), id: 'foreign-native-subject' }])(
    'never downgrades assurance when the provider user is missing or foreign: %j',
    async (user) => {
      mocks.getUser.mockResolvedValue(user);
      mocks.readSessionFactorAge.mockResolvedValue({
        firstFactorMinutes: 0,
        secondFactorMinutes: null,
      });

      const response = await call();

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.token).toBeUndefined();
      expect(body.level).toBeUndefined();
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
      expect(mocks.readSessionFactorAge).not.toHaveBeenCalled();
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it.each([
    { userId: ACCOUNT },
    { userId: ACCOUNT, sessionIdentity: { subject: SUBJECT, sessionId: null } },
    { userId: ACCOUNT, apiKeyId: 'key-1' },
  ])('refuses a canonical principal without a native session: %j', async (principal) => {
    mocks.authenticate.mockResolvedValue(principal);

    expect((await call()).status).toBe(401);

    expect(mocks.claimScope).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses an authenticated developer credential with 403 before provider work', async () => {
    mocks.authenticate.mockResolvedValue({ userId: ACCOUNT, surfaceClass: 'developer' });

    expect((await call()).status).toBe(403);

    expect(mocks.getNeonDb).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('preserves a canonical account-policy denial', async () => {
    mocks.authenticate.mockRejectedValue(createError.forbidden('Account policy refused access'));

    expect((await call()).status).toBe(403);

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.claimScope).not.toHaveBeenCalled();
  });
});

type ImportedModule0 = typeof import('@/lib/services/active-workspace-service');
type ImportedModule1 = typeof import('@/lib/rate-limit');
type ImportedModule2 = typeof import('@/lib/csrf');
type ImportedModule3 = typeof import('@/lib/logger');
type ImportedModule4 = typeof import('@/lib/mfa-policy-gate');
