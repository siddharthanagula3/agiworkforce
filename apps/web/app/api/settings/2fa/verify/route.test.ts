import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  verifyTOTPCode: vi.fn(),
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
