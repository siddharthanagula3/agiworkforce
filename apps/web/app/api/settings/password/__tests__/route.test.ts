import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { IdentityRequestRejectedError } from '@agiworkforce/identity';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUser: vi.fn(),
  verifyPassword: vi.fn(),
  setPassword: vi.fn(),
  requireStepUp: vi.fn(),
  factors: vi.fn(),
  revoke: vi.fn(),
  announce: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/app/api/settings/sessions/session-principal', () => ({
  resolveSessionsPrincipal: mocks.principal,
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({
    getUser: mocks.getUser,
    verifyPassword: mocks.verifyPassword,
    setPassword: mocks.setPassword,
  }),
}));
vi.mock('@/lib/server/step-up-auth', () => ({ requireStepUp: mocks.requireStepUp }));
vi.mock('@/lib/server/step-up/second-factor', () => ({ readSecondFactorStatus: mocks.factors }));
vi.mock('@/lib/server/session-revocation', () => ({ revokeEveryOtherSession: mocks.revoke }));
vi.mock('@/lib/server/two-factor-security-events', () => ({
  announceTwoFactorChange: mocks.announce,
}));
vi.mock('@/lib/security-audit', () => ({
  logAuthFailure: mocks.logAuthFailure,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const DB = { query: vi.fn() };

function request(body: unknown): never {
  return new Request('http://localhost/api/settings/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as never;
}

describe('POST /api/settings/password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.principal.mockResolvedValue({
      db: DB,
      userId: 'user-1',
      organizationId: 'org-1',
      currentSessionId: 'sess-1',
    });
    mocks.getUser.mockResolvedValue({ id: 'user-1', passwordEnabled: true });
    mocks.factors.mockResolvedValue({ anySecondFactor: false, earlierEnrollmentPending: false });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.setPassword.mockResolvedValue(undefined);
    mocks.revoke.mockResolvedValue({ ended: ['a', 'b'], failed: ['c'] });
  });

  it('returns the CSRF refusal before resolving the caller', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    const response = await POST(request({ newPassword: 'longenough' }));
    expect(response.status).toBe(403);
    expect(mocks.principal).not.toHaveBeenCalled();
  });

  it('returns 401 when the caller has no session', async () => {
    mocks.principal.mockRejectedValue(createError.unauthorized());
    const response = await POST(request({ newPassword: 'longenough' }));
    expect(response.status).toBe(401);
    expect(mocks.setPassword).not.toHaveBeenCalled();
  });

  it('rejects a short password and unknown fields', async () => {
    expect((await POST(request({ newPassword: 'short' }))).status).toBe(400);
    expect((await POST(request({ newPassword: 'longenough', extra: true }))).status).toBe(400);
    expect((await POST(request('not json'))).status).toBe(400);
    expect(mocks.setPassword).not.toHaveBeenCalled();
  });

  it('returns 401 when the identity user is gone', async () => {
    mocks.getUser.mockResolvedValue(null);
    const response = await POST(request({ newPassword: 'longenough' }));
    expect(response.status).toBe(401);
  });

  it('requires the current password when one is set', async () => {
    const response = await POST(request({ newPassword: 'longenough' }));
    expect(response.status).toBe(400);
    expect(mocks.setPassword).not.toHaveBeenCalled();
  });

  it('rejects a wrong current password and logs the failure', async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const response = await POST(request({ currentPassword: 'wrong', newPassword: 'longenough' }));
    expect(response.status).toBe(400);
    expect(mocks.logAuthFailure).toHaveBeenCalledWith(
      expect.anything(),
      'invalid_current_password',
      'user-1',
    );
    expect(mocks.setPassword).not.toHaveBeenCalled();
  });

  it('returns the rate limit response keyed to the user', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));
    const response = await POST(request({ currentPassword: 'old', newPassword: 'longenough' }));
    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'auth-password-reset',
      'user:user-1',
    );
    expect(mocks.setPassword).not.toHaveBeenCalled();
  });

  it('demands step-up when a second factor is enrolled and propagates its refusal', async () => {
    mocks.factors.mockResolvedValue({ anySecondFactor: true, earlierEnrollmentPending: false });
    mocks.requireStepUp.mockRejectedValue(createError.forbidden('step up required'));
    const response = await POST(request({ currentPassword: 'old', newPassword: 'longenough' }));
    expect(response.status).toBe(403);
    expect(mocks.requireStepUp).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', action: 'password.change' }),
    );
    expect(mocks.setPassword).not.toHaveBeenCalled();
  });

  it('maps an identity rejection to a 400', async () => {
    mocks.setPassword.mockRejectedValue(
      new IdentityRequestRejectedError('Password has been found in a breach', 'pwned'),
    );
    const response = await POST(request({ currentPassword: 'old', newPassword: 'longenough' }));
    expect(response.status).toBe(400);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it('changes the password, ends other sessions and announces it', async () => {
    const response = await POST(request({ currentPassword: 'old', newPassword: 'longenough' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      otherSessionsEnded: 2,
      otherSessionsRemaining: 1,
    });
    expect(mocks.verifyPassword).toHaveBeenCalledWith('user-1', 'old');
    expect(mocks.setPassword).toHaveBeenCalledWith('user-1', 'longenough');
    expect(mocks.revoke).toHaveBeenCalledWith(expect.anything(), 'user-1', 'sess-1');
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
    expect(mocks.announce).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        event: 'password_changed',
        organizationId: 'org-1',
        detail: { source: 'current_password', count: 2 },
      }),
    );
  });

  it('sets a first password after step-up for an account without one', async () => {
    mocks.getUser.mockResolvedValue({ id: 'user-1', passwordEnabled: false });
    mocks.requireStepUp.mockResolvedValue({ method: 'email_code' });
    const response = await POST(request({ newPassword: 'longenough' }));
    expect(response.status).toBe(200);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.announce).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { source: 'email_code', count: 2 } }),
    );
  });
});
