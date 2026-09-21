import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn(), recordAuditEvent: vi.fn() }));

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
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

function request(code = 'AGIWAITLIST2026') {
  return new NextRequest('https://agiworkforce.com/api/waitlist/access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

describe('POST /api/waitlist/access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants access when the same code was already redeemed by this user', async () => {
    mocks.query.mockResolvedValueOnce([{ redeemed: true }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, accessGranted: true });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('redeems a valid code for billing upgrade access', async () => {
    mocks.query
      .mockResolvedValueOnce([{ redeemed: false }])
      .mockResolvedValueOnce([{ valid: true, invite_id: 'invite-1', error: null }]);

    const response = await POST(request('agioffer1234'));

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/select valid, invite_id, error from validate_and_redeem_invite_code/),
      ['user-1', 'AGIOFFER1234', 'web', 'billing-upgrade'],
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'waitlist_access_redeemed',
        detail: expect.objectContaining({ resourceId: 'invite-1' }),
      }),
    );
  });

  it('treats a concurrent repeat redemption as idempotent access', async () => {
    mocks.query
      .mockResolvedValueOnce([{ redeemed: false }])
      .mockResolvedValueOnce([
        { valid: false, invite_id: 'invite-1', error: 'already_redeemed_by_user' },
      ]);

    const response = await POST(request('agioffer1234'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, accessGranted: true });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', 'expired'],
    ['fully_redeemed', 'redemption limit'],
    ['invalid_code', 'not valid'],
  ])('rejects %s codes without granting access', async (error, message) => {
    mocks.query
      .mockResolvedValueOnce([{ redeemed: false }])
      .mockResolvedValueOnce([{ valid: false, error }]);

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(message);
  });
});
