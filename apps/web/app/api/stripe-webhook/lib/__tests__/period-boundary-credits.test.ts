import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

vi.mock('@/lib/price-tier-mapping', () => ({
  isPriceIdRegistered: (priceId: string | null | undefined) => priceId === 'price_current',
  resolvePlanTier: () => 'pro',
  isValidPlanTier: (tier: string | null | undefined) => tier === 'pro',
  getTierMapping: () => ({ price_current: { tier: 'pro', interval: 'monthly' } }),
}));

const subscriptionServiceMocks = vi.hoisted(() => ({
  allocateCreditsForPeriod: vi.fn().mockResolvedValue(undefined),
  resetCreditsForNewPeriod: vi.fn().mockResolvedValue(undefined),
  carryCreditsForUpgradePeriod: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: subscriptionServiceMocks,
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    getBalance: vi.fn().mockResolvedValue(null),
    deductCredits: vi.fn().mockResolvedValue({ success: true }),
  },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

import { updateSubscriptionFromStripeSubscription } from '../db';

const PERIOD_START = Math.floor(Date.UTC(2026, 1, 23, 9, 15, 0) / 1000);
const PERIOD_END = PERIOD_START + 28 * 24 * 60 * 60;

function subscriptionEvent(periodStart: number): Stripe.Subscription {
  return {
    id: 'sub_live',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: {},
    items: { data: [{ price: { id: 'price_current' } }] },
    current_period_start: periodStart,
    current_period_end: periodStart + 28 * 24 * 60 * 60,
  } as unknown as Stripe.Subscription;
}

/**
 * The stored row is a Date, not a string.
 *
 * This is the whole point of the test. `subscriptions.current_period_start` is
 * `timestamptz`, and the Postgres driver hydrates it as a JS Date, even though
 * the query's row type in db.ts declares `string | null`. Every existing
 * webhook fixture wrote `.toISOString()` there, which is why a comparison that
 * is always true against real data looked correct in tests for so long.
 */
function dbWithStoredPeriodStart(periodStartSeconds: number): DatabaseAdapter {
  const rowsFor = (sql: string): unknown[] => {
    if (sql.includes('select id, user_id, plan_tier')) {
      return [
        {
          id: 'row_1',
          user_id: 'user_123',
          plan_tier: 'pro',
          status: 'active',
          current_period_start: new Date(periodStartSeconds * 1000),
          last_stripe_event_at: null,
        },
      ];
    }
    if (sql.includes('update subscriptions set')) return [{ id: 'row_1' }];
    return [];
  };
  const respond = async (sql: string) => rowsFor(sql);
  return { query: vi.fn(respond), execute: vi.fn(respond) } as unknown as DatabaseAdapter;
}

describe('credit handling across the billing period boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not reset consumed usage when the period has not changed', async () => {
    // A card swap, a seat change, a cancel-and-resume: benign events that all
    // arrive as customer.subscription.updated with the SAME period. Before the
    // fix these compared a Date to an ISO string, which is always unequal, so
    // every one of them called resetCreditsForNewPeriod and zeroed
    // credits_used_cents, a repeatable, self-serve reset of a paid allowance.
    await updateSubscriptionFromStripeSubscription(
      dbWithStoredPeriodStart(PERIOD_START),
      {} as Stripe,
      subscriptionEvent(PERIOD_START),
    );

    expect(subscriptionServiceMocks.resetCreditsForNewPeriod).not.toHaveBeenCalled();
  });

  it('does reset usage when the period genuinely rolls over', async () => {
    await updateSubscriptionFromStripeSubscription(
      dbWithStoredPeriodStart(PERIOD_START),
      {} as Stripe,
      subscriptionEvent(PERIOD_END),
    );

    expect(subscriptionServiceMocks.resetCreditsForNewPeriod).toHaveBeenCalled();
  });
});
