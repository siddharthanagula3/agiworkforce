import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/services/bonus-credit-service');

const mocks = vi.hoisted(() => ({
  getNeonDb: vi.fn(),
  expireDueBonusCredits: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/services/bonus-credit-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  expireDueBonusCredits: mocks.expireDueBonusCredits,
}));

import { GET } from './route';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';

const CRON_SECRET = 'bonus-expiry-cron-secret-0123456789abcdef';
const DB = { query: vi.fn(), execute: vi.fn() };

function cron(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://agiworkforce.com/api/cron/expire-bonus-credits', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  resetCronAuthThrottleForTests();
  mocks.getNeonDb.mockReturnValue(DB);
  mocks.expireDueBonusCredits.mockResolvedValue({
    users: 3,
    expiredMicrousd: 7_500_000,
    failed: 0,
    remaining: false,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/expire-bonus-credits', () => {
  it('refuses a request without the cron secret and expires nothing', async () => {
    expect((await GET(cron(null))).status).toBe(401);
    expect((await GET(cron('not-the-cron-secret'))).status).toBe(401);
    expect(mocks.expireDueBonusCredits).not.toHaveBeenCalled();
  });

  it('expires due bonus lots for at most 500 accounts and reports what it took back', async () => {
    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: 3,
      expiredMicrousd: 7_500_000,
      failed: 0,
      remaining: false,
    });
    expect(mocks.expireDueBonusCredits).toHaveBeenCalledWith(DB, 500);
  });

  it('reports a run that hit its ceiling or failed some accounts rather than hiding it', async () => {
    mocks.expireDueBonusCredits.mockResolvedValueOnce({
      users: 500,
      expiredMicrousd: 1_000_000,
      failed: 2,
      remaining: true,
    });

    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ failed: 2, remaining: true });
  });

  it('answers 500 without the cause when the sweep throws', async () => {
    mocks.expireDueBonusCredits.mockRejectedValueOnce(new Error('bonus_credit_grants is locked'));

    const response = await GET(cron());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
