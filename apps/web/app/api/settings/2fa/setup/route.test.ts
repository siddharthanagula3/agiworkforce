import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
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
  generateBackupCodes: vi.fn(() => ['aaaa-1111', 'bbbb-2222']),
  hashBackupCode: vi.fn(async (code: string) => `hash:${code}`),
}));
vi.mock('@/lib/crypto/totp-envelope', () => ({
  sealTotpSecret: vi.fn(() => 'encrypted-secret'),
}));

import { getUserScopedDb } from '@/lib/server/rls-db';
import { POST } from './route';

function request() {
  return new NextRequest('http://localhost/api/settings/2fa/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}

function existingRow(enabled: boolean | null) {
  return enabled === null ? [] : [{ enabled }];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/settings/2fa/setup', () => {
  it('refuses to re-enroll an account that already has 2FA enabled', async () => {
    mocks.query.mockResolvedValueOnce(existingRow(true));

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sql] = mocks.query.mock.calls[0] as [string];
    expect(sql).toMatch(/select\s+enabled\s+from\s+user_two_factor/i);
  });

  it('never writes enabled=false for an enrolled account', async () => {
    mocks.query.mockResolvedValueOnce(existingRow(true));

    await POST(request());

    const insertCalls = mocks.query.mock.calls.filter(([sql]) =>
      /insert\s+into\s+user_two_factor/i.test(String(sql)),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it('allows a first-time enrollment and returns the secret and backup codes once', async () => {
    mocks.query.mockResolvedValueOnce(existingRow(null)).mockResolvedValueOnce([]);

    const response = await POST(request());
    const body = (await response.json()) as {
      secret: string;
      otpauth_url: string;
      backup_codes: string[];
    };

    expect(response.status).toBe(200);
    expect(body.secret).toBe('SECRET');
    expect(body.otpauth_url).toContain('otpauth://');
    expect(body.backup_codes).toEqual(['aaaa-1111', 'bbbb-2222']);
  });

  it('allows re-running a stale, never-verified setup', async () => {
    mocks.query.mockResolvedValueOnce(existingRow(false)).mockResolvedValueOnce([]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    const insertCalls = mocks.query.mock.calls.filter(([sql]) =>
      /insert\s+into\s+user_two_factor/i.test(String(sql)),
    );
    expect(insertCalls).toHaveLength(1);
  });

  it('exempts an organization owner from the mfa gate so enrollment stays reachable', async () => {
    mocks.query.mockResolvedValueOnce(existingRow(null)).mockResolvedValueOnce([]);

    await POST(request());

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
      resolveOrganization: false,
    });
  });
});
