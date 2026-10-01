import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/services/referral-service');

const mocks = vi.hoisted(() => ({
  getNeonDb: vi.fn(),
  grantDueReferralRewards: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/services/referral-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  grantDueReferralRewards: mocks.grantDueReferralRewards,
}));

import { GET } from './route';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';

const CRON_SECRET = 'referral-reward-cron-secret-0123456789ab';
const DB = { query: vi.fn(), execute: vi.fn() };

function cron(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://agiworkforce.com/api/cron/grant-referral-rewards', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  resetCronAuthThrottleForTests();
  mocks.getNeonDb.mockReturnValue(DB);
  mocks.grantDueReferralRewards.mockResolvedValue({
    processed: 4,
    rewarded: 2,
    capped: 1,
    blocked: 1,
    failed: 0,
    remaining: false,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/grant-referral-rewards', () => {
  it('refuses a request without the cron secret and grants nothing', async () => {
    expect((await GET(cron(null))).status).toBe(401);
    expect((await GET(cron('guessed-secret'))).status).toBe(401);
    expect(mocks.grantDueReferralRewards).not.toHaveBeenCalled();
  });

  it('settles at most 500 referrals past their hold and reports each outcome', async () => {
    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: 4,
      rewarded: 2,
      capped: 1,
      blocked: 1,
      failed: 0,
      remaining: false,
    });
    expect(mocks.grantDueReferralRewards).toHaveBeenCalledWith(DB, 500);
  });

  it('reports a run that left referrals unsettled instead of passing silently', async () => {
    mocks.grantDueReferralRewards.mockResolvedValueOnce({
      processed: 500,
      rewarded: 490,
      capped: 0,
      blocked: 0,
      failed: 10,
      remaining: true,
    });

    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ failed: 10, remaining: true });
  });

  it('answers 500 without the cause when the sweep throws', async () => {
    mocks.grantDueReferralRewards.mockRejectedValueOnce(new Error('referrals relation missing'));

    const response = await GET(cron());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
