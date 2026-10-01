import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { ReferralOverview } from '@/lib/services/referral-service';
type ScanModule0 = typeof import('@/lib/server/rls-db');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/services/referral-service');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  getReferralOverview: vi.fn(),
  recordReferrerNetwork: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/services/referral-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  getReferralOverview: mocks.getReferralOverview,
  recordReferrerNetwork: mocks.recordReferrerNetwork,
}));

import { GET } from './route';
import { createError } from '@/lib/errors';
import { REFERRAL_PROGRAM, referralLink } from '@/lib/services/referral-program';
import { referralNetworkHash } from '@/lib/services/referral-signals';

const USER_ID = 'user_referrer';
const DB = { query: vi.fn(), execute: vi.fn() };
const CALLER_IP = '203.0.113.7';

const OVERVIEW = {
  code: 'ABCD2345',
  link: referralLink('ABCD2345'),
  program: REFERRAL_PROGRAM,
  stats: { joined: 2, subscribed: 1, rewarded: 1, creditsEarned: 500 },
  bonus: { availableCredits: 500, nextExpiry: '2026-12-26T00:00:00.000Z' },
  friends: [],
} as unknown as ReferralOverview;

function get() {
  return new NextRequest('https://agiworkforce.com/api/referrals', {
    headers: { 'x-real-ip': CALLER_IP, 'x-forwarded-for': CALLER_IP },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: USER_ID, organizationId: null });
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getReferralOverview.mockResolvedValue(OVERVIEW);
  mocks.recordReferrerNetwork.mockResolvedValue(undefined);
});

describe('GET /api/referrals', () => {
  it("returns the caller's code, link, stats and friends from the caller-scoped connection", async () => {
    const response = await GET(get());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OVERVIEW);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.getReferralOverview).toHaveBeenCalledWith(DB, USER_ID);
  });

  it('records the network the referrer reads from, hashed, for the same-network check', async () => {
    await GET(get());

    const networkHash = referralNetworkHash(CALLER_IP);
    expect(networkHash).toEqual(expect.any(String));
    expect(networkHash).not.toContain('203.0.113');
    expect(mocks.recordReferrerNetwork).toHaveBeenCalledWith(DB, USER_ID, networkHash);
  });

  it('refuses a caller with no session before reading anything', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await GET(get());

    expect(response.status).toBe(401);
    expect(mocks.recordReferrerNetwork).not.toHaveBeenCalled();
    expect(mocks.getReferralOverview).not.toHaveBeenCalled();
  });

  it('answers with the rate limiter before resolving the caller', async () => {
    mocks.withRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    );

    const response = await GET(get());

    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('maps a storage failure to a generic 500', async () => {
    mocks.getReferralOverview.mockRejectedValueOnce(new Error('relation referral_codes missing'));

    const response = await GET(get());

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('referral_codes');
  });
});
