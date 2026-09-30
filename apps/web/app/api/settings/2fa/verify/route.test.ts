import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  verifyTOTPCode: vi.fn(),
  registerSecondFactor: vi.fn(async (..._args: unknown[]) => undefined),
  rememberMfaEnrollment: vi.fn(async (..._args: unknown[]) => undefined),
  recordAuditEvent: vi.fn(async (_event: Record<string, unknown>) => undefined),
  identityEvent: vi.fn(async (_event: Record<string, unknown>) => ({
    assessment: { level: 'normal', signals: [] },
    response: null,
  })),
  logAuthFailure: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
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
vi.mock('@/features/settings/services/user-preferences', () => ({
  verifyTOTPCode: (...args: unknown[]) => mocks.verifyTOTPCode(...args),
  generateBackupCodes: vi.fn(() => ['aaaa1111', 'bbbb2222']),
}));
vi.mock('@/lib/crypto/totp-envelope', () => ({
  openTotpSecret: vi.fn(() => 'SECRET'),
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({ registerSecondFactor: mocks.registerSecondFactor }),
  getIdentityUser: vi.fn(),
  getRequestIdentity: vi.fn(),
}));
vi.mock('@/lib/mfa-policy-gate', () => ({
  rememberMfaEnrollment: (...args: unknown[]) => mocks.rememberMfaEnrollment(...args),
}));
vi.mock('@/lib/server/two-factor-security-events', () => ({
  announceTwoFactorChange: (event: Record<string, unknown>) => mocks.identityEvent(event),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (event: Record<string, unknown>) => mocks.recordAuditEvent(event),
  logAuthFailure: (...args: unknown[]) => mocks.logAuthFailure(...args),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

import { getUserScopedDb } from '@/lib/server/rls-db';
import { POST } from './route';

function request(code: string) {
  return new NextRequest('http://localhost/api/settings/2fa/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

const PENDING = [{ totp_secret_enc: 'enc' }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '1');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/settings/2fa/verify', () => {
  it('refuses with 503 and registers nothing while authenticator enrollment is unavailable', async () => {
    vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '');
    mocks.query.mockResolvedValueOnce(PENDING).mockResolvedValueOnce([]);
    mocks.verifyTOTPCode.mockResolvedValueOnce(true);

    const response = await POST(request('123456'));
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(503);
    expect(body.error.message).toBe(
      'Authenticator apps and backup codes are temporarily unavailable.',
    );
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
    expect(mocks.rememberMfaEnrollment).not.toHaveBeenCalled();
  });

  it('registers the authenticator and fresh backup codes as a sign-in factor', async () => {
    mocks.query.mockResolvedValueOnce(PENDING).mockResolvedValueOnce([]);
    mocks.verifyTOTPCode.mockResolvedValueOnce(true);

    const response = await POST(request('123456'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      backup_codes: ['aaaa1111', 'bbbb2222'],
    });
    expect(mocks.registerSecondFactor).toHaveBeenCalledWith('user-1', {
      totpSecret: 'SECRET',
      backupCodes: ['aaaa1111', 'bbbb2222'],
    });
    expect(mocks.rememberMfaEnrollment).toHaveBeenCalledWith('user-1', true);
  });

  it('rejects an invalid code and registers nothing', async () => {
    mocks.query.mockResolvedValueOnce(PENDING);
    mocks.verifyTOTPCode.mockResolvedValueOnce(false);

    const response = await POST(request('000000'));

    expect(response.status).toBe(401);
    expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
  });

  it('records the enrollment and tells the account holder it happened', async () => {
    mocks.query.mockResolvedValueOnce(PENDING).mockResolvedValueOnce([]);
    mocks.verifyTOTPCode.mockResolvedValueOnce(true);

    await POST(request('123456'));

    expect(mocks.identityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        event: 'two_factor_enabled',
        detail: expect.objectContaining({ source: 'totp_code' }),
      }),
    );
  });

  it('records nothing and tells nobody when the code is refused', async () => {
    mocks.query.mockResolvedValueOnce(PENDING);
    mocks.verifyTOTPCode.mockResolvedValueOnce(false);

    await POST(request('000000')).catch(() => undefined);

    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    expect(mocks.identityEvent).not.toHaveBeenCalled();
  });

  it('records the refused code as a failed authentication for the account', async () => {
    mocks.query.mockResolvedValueOnce(PENDING);
    mocks.verifyTOTPCode.mockResolvedValueOnce(false);

    await POST(request('000000')).catch(() => undefined);

    expect(mocks.logAuthFailure).toHaveBeenCalledWith(
      expect.anything(),
      'invalid_totp_code',
      'user-1',
    );
  });

  it('asks for a fresh setup when no enrollment is pending', async () => {
    mocks.query.mockResolvedValueOnce([]);

    const response = await POST(request('123456'));

    expect(response.status).toBe(400);
    expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
    expect(mocks.identityEvent).not.toHaveBeenCalled();
  });

  it('stays reachable for a member whose workspace requires two-factor', async () => {
    mocks.query.mockResolvedValueOnce(PENDING).mockResolvedValueOnce([]);
    mocks.verifyTOTPCode.mockResolvedValueOnce(true);

    await POST(request('123456'));

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaEnrollment: true,
      resolveOrganization: false,
    });
  });
});
