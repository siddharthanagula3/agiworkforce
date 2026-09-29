import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  accountSecurityCaller: vi.fn(),
  beginVerification: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/server/account-security/service', () => ({
  ACCOUNT_SECURITY_VERIFYING_SCOPE: {
    resolveOrganization: false,
    accountSecurityVerification: true,
  },
  accountSecurityCaller: mocks.accountSecurityCaller,
  beginVerification: mocks.beginVerification,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const scoped = { db: { query: vi.fn() }, userId: 'user-1', organizationId: null };
const caller = { ...scoped, sessionId: 'sess-1' };

function request(): never {
  return new Request('http://localhost/api/account-security/verification/options', {
    method: 'POST',
  }) as never;
}

describe('POST /api/account-security/verification/options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue(scoped);
    mocks.accountSecurityCaller.mockResolvedValue(caller);
    mocks.beginVerification.mockResolvedValue({ challenge: 'challenge-1' });
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.beginVerification).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.beginVerification).not.toHaveBeenCalled();
  });

  it('returns uncached assertion options for the caller', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-location')).toBe(
      '/api/account-security/verification/options',
    );
    await expect(response.json()).resolves.toEqual({ challenge: 'challenge-1' });
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'account-security-verify');
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
      accountSecurityVerification: true,
    });
    expect(mocks.beginVerification).toHaveBeenCalledWith(caller);
  });

  it('maps an account with no keys to 409', async () => {
    mocks.beginVerification.mockRejectedValue(
      createError.conflict('Add a passkey or security key first.'),
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'CONFLICT', message: 'Add a passkey or security key first.' },
    });
  });
});
