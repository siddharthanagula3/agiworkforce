import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  verifyStep: vi.fn(),
  verifyBackup: vi.fn(),
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
  verifyTOTPStep: (...args: unknown[]) => mocks.verifyStep(...args),
  verifyBackupCode: (...args: unknown[]) => mocks.verifyBackup(...args),
}));
vi.mock('@/lib/crypto/totp-envelope', () => ({
  openTotpSecret: vi.fn(() => 'SECRET'),
}));

import { getUserScopedDb } from '@/lib/server/rls-db';
import { POST } from './route';

const ROW = {
  totp_secret_enc: 'enc',
  backup_codes_hashed: ['hash:a', 'hash:b'],
  enabled: true,
  last_totp_step: null,
};

function request(code: string) {
  return new NextRequest('http://localhost/api/settings/2fa/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyStep.mockResolvedValue(null);
  mocks.verifyBackup.mockResolvedValue(-1);
});

describe('POST /api/settings/2fa/validate, TOTP replay', () => {
  it('accepts a fresh code and claims its step', async () => {
    mocks.verifyStep.mockResolvedValue(58_000_000);
    mocks.query.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([{ user_id: 'user-1' }]);

    const response = await POST(request('123456'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ valid: true, used_backup_code: false });
    const [sql, params] = mocks.query.mock.calls[1]!;
    expect(sql).toContain('last_totp_step is null or last_totp_step < $2');
    expect(params).toEqual(['user-1', 58_000_000]);
  });

  it('refuses a code whose step has already been spent', async () => {
    mocks.verifyStep.mockResolvedValue(58_000_000);
    mocks.query.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([]);

    const response = await POST(request('123456'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ valid: false });
  });
});

describe('POST /api/settings/2fa/validate, backup codes', () => {
  it('spends a backup code with a single guarded statement, not read-modify-write', async () => {
    mocks.verifyBackup.mockResolvedValue(1);
    mocks.query.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([{ remaining: 1 }]);

    const response = await POST(request('bbbb-2222'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ valid: true, used_backup_code: true });

    const [sql, params] = mocks.query.mock.calls[1]!;
    expect(sql).toContain('array_remove(backup_codes_hashed, $2)');
    expect(sql, 'consumption must be conditional on the code still being present').toContain(
      '$2 = any(backup_codes_hashed)',
    );
    expect(sql, 'writing a filtered array back lets two requests spend one code').not.toMatch(
      /set\s+backup_codes_hashed\s*=\s*\$2/,
    );
    expect(params).toEqual(['user-1', 'hash:b']);
  });

  it('refuses the second request when a concurrent one already spent the code', async () => {
    mocks.verifyBackup.mockResolvedValue(1);
    mocks.query.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([]);

    const response = await POST(request('bbbb-2222'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ valid: false });
  });

  it('rejects a code that is neither a current TOTP nor a live backup code', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    const response = await POST(request('000000'));

    expect(response.status).toBe(401);
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it('exempts an organization owner from the mfa gate so validation stays reachable', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await POST(request('000000'));

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
      resolveOrganization: false,
    });
  });
});
