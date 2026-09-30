import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  readSecondFactorStatus: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1', email: 'user@example.com' })),
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
  generateTOTPSecret: vi.fn(() => 'SECRET'),
  generateOTPAuthURL: vi.fn(() => 'otpauth://totp/AGI:user@example.com?secret=SECRET'),
}));
vi.mock('@/lib/server/step-up/second-factor', () => ({
  readSecondFactorStatus: (...args: unknown[]) => mocks.readSecondFactorStatus(...args),
}));
vi.mock('@/lib/crypto/totp-envelope', () => ({
  sealTotpSecret: vi.fn(() => 'encrypted-secret'),
  openTotpSecret: vi.fn(),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  logAuthFailure: vi.fn(),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

process.env['CSRF_SECRET'] = 'two-factor-setup-step-up-secret-long-enough';

import { getUserScopedDb } from '@/lib/server/rls-db';
import { sealTotpSecret } from '@/lib/crypto/totp-envelope';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant } from '@/lib/server/step-up/grant-token';
import { POST } from './route';

function request() {
  const { token } = createStepUpGrant({
    userId: 'user-1',
    action: 'two_factor.enable',
    resourceId: null,
    method: 'first_factor',
  });
  return new NextRequest('http://localhost/api/settings/2fa/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [STEP_UP_TOKEN_HEADER]: token },
  });
}

function enrolled(authenticator: boolean) {
  mocks.readSecondFactorStatus.mockResolvedValueOnce({
    authenticator,
    backupCodes: authenticator,
    anySecondFactor: authenticator,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '1');
  vi.mocked(sealTotpSecret).mockReturnValue('encrypted-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/settings/2fa/setup', () => {
  it('refuses with 503 and stores nothing while authenticator enrollment is unavailable', async () => {
    vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '');
    enrolled(false);

    const response = await POST(request());
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(503);
    expect(body.error.message).toBe(
      'Authenticator apps and backup codes are temporarily unavailable.',
    );
    expect(sealTotpSecret).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('refuses to re-enroll an account whose sign-in already asks for an authenticator', async () => {
    enrolled(true);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('allows a first-time enrollment and returns only the setup key', async () => {
    enrolled(false);
    mocks.query.mockResolvedValueOnce([]);

    const response = await POST(request());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body['secret']).toBe('SECRET');
    expect(String(body['otpauth_url'])).toContain('otpauth://');
    expect(body).not.toHaveProperty('backup_codes');
  });

  it('stores the pending secret sealed and switched off until a code confirms it', async () => {
    enrolled(false);
    mocks.query.mockResolvedValueOnce([]);

    await POST(request());

    const insertCalls = mocks.query.mock.calls.filter(([sql]) =>
      /insert\s+into\s+user_two_factor/i.test(String(sql)),
    );
    expect(insertCalls).toHaveLength(1);
    expect(String(insertCalls[0]?.[0])).toMatch(/enabled\s+=\s+false/);
    expect(insertCalls[0]?.[1]).toEqual(['user-1', 'encrypted-secret']);
  });

  it('stays reachable for a member whose workspace requires two-factor', async () => {
    enrolled(false);
    mocks.query.mockResolvedValueOnce([]);

    await POST(request());

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaEnrollment: true,
      resolveOrganization: false,
    });
  });

  it('returns safe availability guidance when secret encryption is misconfigured', async () => {
    enrolled(false);
    vi.mocked(sealTotpSecret).mockImplementationOnce(() => {
      throw new Error('TOTP_ENCRYPTION_KEY too short: internal configuration detail');
    });

    const response = await POST(request());
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(503);
    expect(body.error.message).toBe(
      'Authenticator setup is temporarily unavailable. Try again later or contact support.',
    );
    expect(body.error.message).not.toContain('TOTP_ENCRYPTION_KEY');
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
