import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  readSecondFactorStatus: vi.fn(),
  removeSecondFactor: vi.fn(async (..._args: unknown[]) => undefined),
  rememberMfaEnrollment: vi.fn(async (..._args: unknown[]) => undefined),
  recordAuditEvent: vi.fn(async (_event: Record<string, unknown>) => undefined),
  identityEvent: vi.fn(async (_event: Record<string, unknown>) => ({
    assessment: { level: 'none', signals: [] },
    response: null,
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (event: Record<string, unknown>) => mocks.recordAuditEvent(event),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({ removeSecondFactor: mocks.removeSecondFactor }),
  getIdentityUser: vi.fn(),
  getRequestIdentity: vi.fn(),
}));
vi.mock('@/lib/server/step-up/second-factor', () => ({
  readSecondFactorStatus: (...args: unknown[]) => mocks.readSecondFactorStatus(...args),
}));
vi.mock('@/lib/mfa-policy-gate', () => ({
  rememberMfaEnrollment: (...args: unknown[]) => mocks.rememberMfaEnrollment(...args),
}));
vi.mock('@/lib/server/two-factor-security-events', () => ({
  announceTwoFactorChange: (event: Record<string, unknown>) => mocks.identityEvent(event),
}));

process.env['CSRF_SECRET'] = 'two-factor-disable-step-up-secret-long-enough';

import { getUserScopedDb } from '@/lib/server/rls-db';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';
import { GET, DELETE } from './route';

const ENROLLED = { authenticator: true, backupCodes: true, anySecondFactor: true };
const NOT_ENROLLED = { authenticator: false, backupCodes: false, anySecondFactor: false };

function getRequest() {
  return new NextRequest('http://localhost/api/settings/2fa');
}

function deleteRequest(stepUpToken?: string) {
  return new NextRequest('http://localhost/api/settings/2fa', {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      ...(stepUpToken ? { [STEP_UP_TOKEN_HEADER]: stepUpToken } : {}),
    },
  });
}

function grant(method: 'second_factor' | 'first_factor' = 'second_factor') {
  return createStepUpGrant({
    userId: 'user-1',
    action: 'two_factor.disable',
    resourceId: null,
    method,
  }).token;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStepUpSigningKeyCache();
  mocks.readSecondFactorStatus.mockResolvedValue(ENROLLED);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/settings/2fa', () => {
  it('reports whether sign-in asks for the authenticator and whether backup codes exist', async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      enabled: true,
      backup_codes_ready: true,
      enrollment_available: false,
    });
  });

  it('reports enrollment as available once authenticator enrollment is switched on', async () => {
    vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '1');

    const response = await GET(getRequest());

    await expect(response.json()).resolves.toMatchObject({ enrollment_available: true });
  });

  it('stays reachable for a member whose workspace requires two-factor', async () => {
    await GET(getRequest());

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaEnrollment: true,
      resolveOrganization: false,
    });
  });
});

describe('DELETE /api/settings/2fa', () => {
  it('refuses to disable without a fresh verification, and removes nothing', async () => {
    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    expect(mocks.removeSecondFactor).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'step_up_challenged', outcome: 'denied' }),
    );
  });

  it('refuses a proof minted for a different action', async () => {
    const otherAction = createStepUpGrant({
      userId: 'user-1',
      action: 'account.delete',
      resourceId: null,
      method: 'second_factor',
    }).token;

    const response = await DELETE(deleteRequest(otherAction));

    expect(response.status).toBe(403);
    expect(mocks.removeSecondFactor).not.toHaveBeenCalled();
  });

  it('removes the sign-in factor once the account holder re-verified', async () => {
    mocks.query.mockResolvedValueOnce([]);

    const response = await DELETE(deleteRequest(grant()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.removeSecondFactor).toHaveBeenCalledWith('user-1');
    expect(mocks.rememberMfaEnrollment).toHaveBeenCalledWith('user-1', false);
  });

  it('records how the account holder re-verified, and tells them', async () => {
    mocks.query.mockResolvedValueOnce([]);

    await DELETE(deleteRequest(grant('first_factor')));

    expect(mocks.identityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'two_factor_disabled',
        detail: expect.objectContaining({ source: 'first_factor' }),
      }),
    );
  });

  it('stays idempotent for an account that never enrolled, without a challenge', async () => {
    mocks.readSecondFactorStatus.mockResolvedValueOnce(NOT_ENROLLED);

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    expect(mocks.removeSecondFactor).not.toHaveBeenCalled();
  });
});
