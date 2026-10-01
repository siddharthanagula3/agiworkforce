import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/services/subscription-service');
type ScanModule2 = typeof import('@/lib/services/effective-subscription-service');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  allocateCreditsForPeriod: vi.fn(),
  provisionSeatMemberCreditAccounts: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: () => ({ query: mocks.query, execute: vi.fn() }),
}));
vi.mock('@/lib/services/subscription-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  SubscriptionService: { allocateCreditsForPeriod: mocks.allocateCreditsForPeriod },
}));
vi.mock('@/lib/services/effective-subscription-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  provisionSeatMemberCreditAccounts: mocks.provisionSeatMemberCreditAccounts,
}));

import { GET } from './route';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';

const CRON_SECRET = 'credit-reset-cron-secret-0123456789abcde';

function cron(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://agiworkforce.com/api/cron/reset-credits', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function subscription(index: number, planTier: string | null = 'pro') {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    user_id: `user_${index}`,
    plan_tier: planTier,
    stripe_price_id: planTier ? `price_${planTier}` : null,
    current_period_start: '2026-09-27T00:00:00.000Z',
    current_period_end: '2026-10-27T00:00:00.000Z',
    status: 'active',
    plan_catalog_version: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  resetCronAuthThrottleForTests();
  mocks.allocateCreditsForPeriod.mockImplementation(async (userId: string) => `account_${userId}`);
  mocks.provisionSeatMemberCreditAccounts.mockResolvedValue(4);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/reset-credits', () => {
  it('refuses a request without the cron secret and allocates nothing', async () => {
    expect((await GET(cron(null))).status).toBe(401);
    expect((await GET(cron('not-the-cron-secret'))).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('allocates the new period for every entitled subscription and the seats of a seat plan', async () => {
    mocks.query.mockResolvedValueOnce([subscription(1, 'pro'), subscription(2, 'team')]);

    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: 'Credit reset completed',
      total: 2,
      reset: 2,
      seatLedgers: 4,
      errors: 0,
      drained: true,
    });
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([['active', 'trialing'], null, null, 200]);
    expect(mocks.allocateCreditsForPeriod).toHaveBeenCalledWith(
      'user_1',
      subscription(1).id,
      'pro',
      new Date('2026-09-27T00:00:00.000Z'),
      new Date('2026-10-27T00:00:00.000Z'),
      expect.objectContaining({ stripePriceId: 'price_pro', catalogVersion: 1 }),
    );
    expect(mocks.provisionSeatMemberCreditAccounts).toHaveBeenCalledTimes(1);
    expect(mocks.provisionSeatMemberCreditAccounts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ownerUserId: 'user_2', subscriptionId: subscription(2).id }),
    );
  });

  it('allocates a subscription with no stored plan as Free', async () => {
    mocks.query.mockResolvedValueOnce([subscription(3, null)]);

    await GET(cron());

    expect(mocks.allocateCreditsForPeriod.mock.calls[0]?.[2]).toBe('free');
  });

  it('walks the next page from the last subscription it saw', async () => {
    const fullPage = Array.from({ length: 200 }, (_, index) => subscription(index + 1));
    mocks.query.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([subscription(500)]);

    const response = await GET(cron());

    expect(await response.json()).toMatchObject({ total: 201, drained: true });
    const last = fullPage.at(-1)!;
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([
      ['active', 'trialing'],
      new Date(last.current_period_start).toISOString(),
      last.id,
      200,
    ]);
  });

  it('counts a subscription it could not allocate and carries on with the rest', async () => {
    mocks.query.mockResolvedValueOnce([subscription(1), subscription(2)]);
    mocks.allocateCreditsForPeriod
      .mockRejectedValueOnce(new Error('token_credits unique violation'))
      .mockResolvedValueOnce('account_user_2');

    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 2, reset: 1, errors: 1 });
  });

  it('answers 500 when the subscriptions cannot be read', async () => {
    mocks.query.mockRejectedValueOnce(new Error('connection terminated'));

    const response = await GET(cron());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
