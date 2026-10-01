import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/rls-db');
type ScanModule1 = typeof import('@/lib/csrf');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/services/referral-service');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  ensureReferralCode: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/services/referral-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  ensureReferralCode: mocks.ensureReferralCode,
}));

import { POST } from './route';
import { createError } from '@/lib/errors';
import { referralLink } from '@/lib/services/referral-program';
import { referralNetworkHash } from '@/lib/services/referral-signals';

const USER_ID = 'user_referrer';
const DB = { query: vi.fn(), execute: vi.fn() };
const CALLER_IP = '198.51.100.23';

function post() {
  return new NextRequest('https://agiworkforce.com/api/referrals/code', {
    method: 'POST',
    headers: { 'x-real-ip': CALLER_IP, 'x-forwarded-for': CALLER_IP },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: USER_ID, organizationId: null });
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.ensureReferralCode.mockResolvedValue('ABCD2345');
});

describe('POST /api/referrals/code', () => {
  it("creates the caller's code on first request and answers it with the /r/ link", async () => {
    const response = await POST(post());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { code: string; link: string };
    expect(body).toEqual({ code: 'ABCD2345', link: referralLink('ABCD2345') });
    expect(body.link.endsWith('/r/ABCD2345')).toBe(true);
    expect(mocks.ensureReferralCode).toHaveBeenCalledWith(
      DB,
      USER_ID,
      referralNetworkHash(CALLER_IP),
    );
  });

  it('refuses a write that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'CSRF_REQUIRED' } }, { status: 403 }),
    );

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), USER_ID);
    expect(mocks.ensureReferralCode).not.toHaveBeenCalled();
  });

  it('refuses a caller with no session', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await POST(post());

    expect(response.status).toBe(401);
    expect(mocks.ensureReferralCode).not.toHaveBeenCalled();
  });

  it('answers with the rate limiter before resolving the caller', async () => {
    mocks.withRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    );

    const response = await POST(post());

    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('maps a failure to mint a unique code to a generic 500', async () => {
    mocks.ensureReferralCode.mockRejectedValueOnce(new Error('Could not allocate a referral code'));

    const response = await POST(post());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });
});
