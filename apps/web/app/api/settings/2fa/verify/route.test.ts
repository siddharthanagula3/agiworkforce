import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  verifyTOTPCode: vi.fn(),
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
vi.mock('@/features/settings/services/user-preferences', () => ({
  verifyTOTPCode: (...args: unknown[]) => mocks.verifyTOTPCode(...args),
}));
vi.mock('@/lib/crypto/totp-envelope', () => ({
  openTotpSecret: vi.fn(() => 'SECRET'),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/settings/2fa/verify', () => {
  it('enables 2FA on a valid code', async () => {
    mocks.query.mockResolvedValueOnce([{ totp_secret_enc: 'enc', enabled: false }]);
    mocks.verifyTOTPCode.mockResolvedValueOnce(true);

    const response = await POST(request('123456'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('rejects an invalid code', async () => {
    mocks.query.mockResolvedValueOnce([{ totp_secret_enc: 'enc', enabled: false }]);
    mocks.verifyTOTPCode.mockResolvedValueOnce(false);

    const response = await POST(request('000000'));

    expect(response.status).toBe(401);
  });

  it('records the enrollment and tells the account holder it happened', async () => {
    mocks.query.mockResolvedValueOnce([{ totp_secret_enc: 'enc', enabled: false }]);
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
    mocks.query.mockResolvedValueOnce([{ totp_secret_enc: 'enc', enabled: false }]);
    mocks.verifyTOTPCode.mockResolvedValueOnce(false);

    await POST(request('000000')).catch(() => undefined);

    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    expect(mocks.identityEvent).not.toHaveBeenCalled();
  });

  it('records the refused code as a failed authentication for the account', async () => {
    mocks.query.mockResolvedValueOnce([{ totp_secret_enc: 'enc', enabled: false }]);
    mocks.verifyTOTPCode.mockResolvedValueOnce(false);

    await POST(request('000000')).catch(() => undefined);

    expect(mocks.logAuthFailure).toHaveBeenCalledWith(
      expect.anything(),
      'invalid_totp_code',
      'user-1',
    );
  });

  it('writes no audit row when 2FA was already on', async () => {
    mocks.query.mockResolvedValueOnce([{ totp_secret_enc: 'enc', enabled: true }]);

    await POST(request('123456'));

    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    expect(mocks.identityEvent).not.toHaveBeenCalled();
  });

  it('exempts an organization owner from the mfa gate so verification stays reachable', async () => {
    mocks.query.mockResolvedValueOnce([{ totp_secret_enc: 'enc', enabled: false }]);
    mocks.verifyTOTPCode.mockResolvedValueOnce(true);

    await POST(request('123456'));

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
      resolveOrganization: false,
    });
  });
});
