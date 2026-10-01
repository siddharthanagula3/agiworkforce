import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/services/purchased-credit-expiry-service');

const mocks = vi.hoisted(() => ({
  getNeonDb: vi.fn(),
  expireDuePurchasedCredits: vi.fn(),
  remindExpiringPurchasedCredits: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/services/purchased-credit-expiry-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  expireDuePurchasedCredits: mocks.expireDuePurchasedCredits,
  remindExpiringPurchasedCredits: mocks.remindExpiringPurchasedCredits,
}));

import { GET } from './route';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';

const CRON_SECRET = 'purchase-expiry-cron-secret-0123456789ab';
const DB = { query: vi.fn(), execute: vi.fn() };
const REMINDERS = { users: 2, reminded: 2, failed: 0, remaining: false };
const EXPIRY = { users: 1, expiredMicrousd: 2_500_000, failed: 0, remaining: false };

function cron(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://agiworkforce.com/api/cron/expire-purchased-credits', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  resetCronAuthThrottleForTests();
  mocks.getNeonDb.mockReturnValue(DB);
  mocks.remindExpiringPurchasedCredits.mockResolvedValue(REMINDERS);
  mocks.expireDuePurchasedCredits.mockResolvedValue(EXPIRY);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/expire-purchased-credits', () => {
  it('refuses a request without the cron secret and touches no purchase', async () => {
    expect((await GET(cron(null))).status).toBe(401);
    expect((await GET(cron('wrong-secret-value'))).status).toBe(401);
    expect(mocks.remindExpiringPurchasedCredits).not.toHaveBeenCalled();
    expect(mocks.expireDuePurchasedCredits).not.toHaveBeenCalled();
  });

  it('sends the expiry reminders before it expires anything, 500 accounts at most each', async () => {
    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reminders: REMINDERS, expiry: EXPIRY });
    expect(mocks.remindExpiringPurchasedCredits).toHaveBeenCalledWith(DB, 500);
    expect(mocks.expireDuePurchasedCredits).toHaveBeenCalledWith(DB, 500);
    expect(mocks.remindExpiringPurchasedCredits.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.expireDuePurchasedCredits.mock.invocationCallOrder[0]!,
    );
  });

  it('reports failed accounts and an unfinished run in the summary', async () => {
    mocks.expireDuePurchasedCredits.mockResolvedValueOnce({
      ...EXPIRY,
      failed: 1,
      remaining: true,
    });

    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ expiry: { failed: 1, remaining: true } });
  });

  it('expires nothing when the reminders cannot be read, and answers 500', async () => {
    mocks.remindExpiringPurchasedCredits.mockRejectedValueOnce(new Error('email queue down'));

    const response = await GET(cron());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(mocks.expireDuePurchasedCredits).not.toHaveBeenCalled();
  });
});
