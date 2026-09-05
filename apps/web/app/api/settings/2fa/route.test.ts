import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  verifyStep: vi.fn(),
  verifyBackup: vi.fn(),
  claimTotpStep: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
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
  verifyBackupCode: (...args: unknown[]) => mocks.verifyBackup(...args),
}));
vi.mock('@/lib/crypto/totp-envelope', () => ({
  openTotpSecret: vi.fn(() => 'SECRET'),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

import { getUserScopedDb } from '@/lib/server/rls-db';
import { GET, DELETE } from './route';

const ROW = {
  user_id: 'user-1',
  totp_secret_enc: 'enc',
  backup_codes_hashed: ['hash:a'],
  enabled: true,
  enabled_at: '2026-08-01T00:00:00.000Z',
  backup_codes_generated_at: '2026-08-01T00:00:00.000Z',
  last_verified_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

function getRequest() {
  return new NextRequest('http://localhost/api/settings/2fa');
}

function deleteRequest(code: string) {
  return new NextRequest('http://localhost/api/settings/2fa', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyStep.mockResolvedValue(null);
  mocks.verifyBackup.mockResolvedValue(-1);
  mocks.claimTotpStep.mockResolvedValue(true);
});

describe('GET /api/settings/2fa', () => {
  it('reports enrollment status', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ enabled: true });
  });

  it('exempts an organization owner from the mfa gate so status stays reachable', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await GET(getRequest());

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
      resolveOrganization: false,
    });
  });
});

describe('DELETE /api/settings/2fa', () => {
  it('disables 2FA with a valid TOTP code', async () => {
    mocks.verifyStep.mockResolvedValue(58_000_000);
    mocks.query.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([]);

    const response = await DELETE(deleteRequest('123456'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('exempts an organization owner from the mfa gate so disabling stays reachable', async () => {
    mocks.verifyStep.mockResolvedValue(58_000_000);
    mocks.query.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([]);

    await DELETE(deleteRequest('123456'));

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
      resolveOrganization: false,
    });
  });
});
