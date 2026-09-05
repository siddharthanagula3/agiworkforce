import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  verifyStep: vi.fn(),
  claimTotpStep: vi.fn(),
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
vi.mock('@/lib/server/two-factor-replay', () => ({
  claimTotpStep: (...args: unknown[]) => mocks.claimTotpStep(...args),
}));
vi.mock('@/features/settings/services/user-preferences', () => ({
  verifyTOTPStep: (...args: unknown[]) => mocks.verifyStep(...args),
  generateBackupCodes: vi.fn(() => ['cccc-3333', 'dddd-4444']),
  hashBackupCode: vi.fn(async (code: string) => `hash:${code}`),
}));
vi.mock('@/lib/crypto/totp-envelope', () => ({
  openTotpSecret: vi.fn(() => 'SECRET'),
}));

import { getUserScopedDb } from '@/lib/server/rls-db';
import { POST } from './route';

const ROW = { totp_secret_enc: 'enc', enabled: true };

function request(code: string) {
  return new NextRequest('http://localhost/api/settings/2fa/backup-codes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claimTotpStep.mockResolvedValue(true);
});

describe('POST /api/settings/2fa/backup-codes', () => {
  it('regenerates backup codes on a valid TOTP code', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);
    mocks.verifyStep.mockResolvedValueOnce(58_000_000);

    const response = await POST(request('123456'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      backup_codes: ['cccc-3333', 'dddd-4444'],
    });
  });

  it('rejects an invalid TOTP code', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);
    mocks.verifyStep.mockResolvedValueOnce(null);

    const response = await POST(request('000000'));

    expect(response.status).toBe(401);
  });

  it('exempts an organization owner from the mfa gate so regeneration stays reachable', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);
    mocks.verifyStep.mockResolvedValueOnce(58_000_000);

    await POST(request('123456'));

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
      resolveOrganization: false,
    });
  });
});
