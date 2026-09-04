import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  allocate: vi.fn(),
  reset: vi.fn(),
  carryUpgrade: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    allocateCreditsForPeriod: serviceMocks.allocate,
    resetCreditsForNewPeriod: serviceMocks.reset,
    carryCreditsForUpgradePeriod: serviceMocks.carryUpgrade,
  },
}));
vi.mock('@/lib/services/credit-service', () => ({ CreditService: {} }));
vi.mock('@/lib/price-tier-mapping', () => ({
  resolvePlanTier: vi.fn((metadata: Record<string, string> | null) => metadata?.['plan_tier']),
  isValidPlanTier: vi.fn(() => true),
  getTierMapping: vi.fn(() => ({ price_max: { tier: 'max', interval: 'monthly' } })),
  isPriceIdRegistered: vi.fn(() => true),
  getEnterpriseProductId: vi.fn(() => null),
  isEnterpriseProductId: vi.fn(() => false),
}));
import { updateSubscriptionFromStripeSubscription } from '@/app/api/stripe-webhook/lib/db';

function subscription(
  planTier: string,
  periodStart: number,
  overrides: Record<string, unknown> = {},
): Stripe.Subscription {
  return {
    id: 'sub_stripe_1',
    customer: 'cus_1',
    status: 'active',
    metadata: { user_id: 'user-123', plan_tier: planTier },
    items: {
      data: [
        {
          id: 'si_1',
          current_period_start: periodStart,
          current_period_end: periodStart + 30 * 24 * 60 * 60,
          price: { id: planTier === 'pro' ? 'price_pro' : 'price_max' },
        },
      ],
    },
    cancel_at_period_end: false,
    canceled_at: null,
    discounts: [],
    pending_update: null,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function database(existingPlan: string, existingPeriodStart: string) {
  return {
    query: vi.fn(async (sql: string) => {
      if (
        sql.includes('from subscriptions where stripe_subscription_id') &&
        !sql.includes('update subscriptions')
      ) {
        return [
          {
            id: 'sub_db_1',
            user_id: 'user-123',
            plan_tier: existingPlan,
            current_period_start: existingPeriodStart,
          },
        ];
      }
      if (sql.includes('update subscriptions set')) return [{ id: 'sub_db_1' }];
      return [];
    }),
    execute: vi.fn(async () => 1),
  };
}

describe('subscription webhook usage rollover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.allocate.mockResolvedValue('credit-account-1');
    serviceMocks.reset.mockResolvedValue('credit-account-1');
    serviceMocks.carryUpgrade.mockResolvedValue('credit-account-1');
  });

  it('carries consumption into a fresh billing period when the paid plan changes upward', async () => {
    const db = database('pro', '2026-07-01T00:00:00.000Z');
    const nextPeriodStart = Date.parse('2026-07-18T18:00:00.000Z') / 1000;

    await updateSubscriptionFromStripeSubscription(
      db as never,
      {} as Stripe,
      subscription('max', nextPeriodStart),
    );

    expect(serviceMocks.carryUpgrade).toHaveBeenCalledWith(
      'user-123',
      'sub_db_1',
      'pro',
      'max',
      new Date(nextPeriodStart * 1000),
      new Date((nextPeriodStart + 30 * 24 * 60 * 60) * 1000),
      db,
    );
    expect(serviceMocks.reset).not.toHaveBeenCalled();
    expect(serviceMocks.allocate).not.toHaveBeenCalled();
  });

  it('still resets included usage on an ordinary renewal of the same plan', async () => {
    const db = database('pro', '2026-07-01T00:00:00.000Z');
    const nextPeriodStart = Date.parse('2026-08-01T00:00:00.000Z') / 1000;

    await updateSubscriptionFromStripeSubscription(
      db as never,
      {} as Stripe,
      subscription('pro', nextPeriodStart),
    );

    expect(serviceMocks.reset).toHaveBeenCalledOnce();
    expect(serviceMocks.carryUpgrade).not.toHaveBeenCalled();
  });

  it('carries usage when subscription.created arrives before checkout completion', async () => {
    const periodStart = Date.parse('2026-07-23T18:00:00.000Z') / 1000;
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('from subscriptions where stripe_subscription_id')) return [];
        if (sql.includes('select id from profiles where id')) return [{ id: 'user-123' }];
        if (sql.includes('from subscriptions where user_id')) {
          return [
            {
              id: 'sub_db_1',
              plan_tier: 'max',
              stripe_subscription_id: null,
            },
          ];
        }
        if (sql.includes('insert into subscriptions')) return [{ id: 'sub_db_1' }];
        return [];
      }),
      execute: vi.fn(async () => 1),
    };
    const stripe = {
      customers: {
        retrieve: vi.fn(async () => ({
          id: 'cus_1',
          deleted: false,
          email: 'investor@example.com',
        })),
      },
    };

    await updateSubscriptionFromStripeSubscription(
      db as never,
      stripe as never,
      subscription('max', periodStart, {
        metadata: {
          user_id: 'user-123',
          plan_tier: 'max',
          upgrade_from: 'max',
          replace_unlinked_entitlement: 'true',
        },
      }),
    );

    expect(serviceMocks.carryUpgrade).toHaveBeenCalledWith(
      'user-123',
      'sub_db_1',
      'max',
      'max',
      new Date(periodStart * 1000),
      new Date((periodStart + 30 * 24 * 60 * 60) * 1000),
      db,
    );
    expect(serviceMocks.allocate).not.toHaveBeenCalled();
    expect(serviceMocks.reset).not.toHaveBeenCalled();
  });

  it('does not provision a plan while Stripe is still waiting for upgrade payment', async () => {
    const db = database('pro', '2026-07-01T00:00:00.000Z');
    const nextPeriodStart = Date.parse('2026-07-18T18:00:00.000Z') / 1000;

    await updateSubscriptionFromStripeSubscription(
      db as never,
      {} as Stripe,
      subscription('max', nextPeriodStart, {
        pending_update: { expires_at: nextPeriodStart + 86_400 },
      }),
    );

    expect(db.query).not.toHaveBeenCalled();
    expect(serviceMocks.carryUpgrade).not.toHaveBeenCalled();
    expect(serviceMocks.reset).not.toHaveBeenCalled();
  });
});
