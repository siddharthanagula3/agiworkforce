import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const PRO_MONTHLY_PRICE = 'price_pro_monthly_test';
const PRO_YEARLY_PRICE = 'price_pro_yearly_test';
const MAX_MONTHLY_PRICE = 'price_max_monthly_test';

const mocks = vi.hoisted(() => ({ getTierMapping: vi.fn() }));
vi.mock('@/lib/price-tier-mapping', () => ({ getTierMapping: mocks.getTierMapping }));

import {
  compareBilledPrice,
  expectedUnitAmount,
  reconcileBilledPlans,
} from '../billing-reconciliation';

const PRO_MONTHLY_CENTS = 20_00;
const MAX_MONTHLY_CENTS = 100_00;

function stripeSubscription(priceId: string, unitAmount: number, currency = 'usd') {
  return {
    items: { data: [{ price: { id: priceId, unit_amount: unitAmount, currency } }] },
  };
}

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    stripe_subscription_id: 'sub_1',
    plan_tier: 'pro',
    billing_interval: 'monthly',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTierMapping.mockReturnValue({
    [PRO_MONTHLY_PRICE]: { tier: 'pro', interval: 'monthly' },
    [PRO_YEARLY_PRICE]: { tier: 'pro', interval: 'yearly' },
    [MAX_MONTHLY_PRICE]: { tier: 'max', interval: 'monthly' },
  });
});

describe('expectedUnitAmount', () => {
  it('reads the published list price rather than a literal', () => {
    expect(expectedUnitAmount('pro', 'monthly', 'usd')).toBe(PRO_MONTHLY_CENTS);
    expect(expectedUnitAmount('max', 'monthly', 'usd')).toBe(MAX_MONTHLY_CENTS);
  });

  it('has no opinion on a currency the catalogue does not publish', () => {
    expect(expectedUnitAmount('pro', 'monthly', 'eur')).toBeNull();
  });

  it('has no opinion where the plan publishes no price for that interval', () => {
    expect(expectedUnitAmount('max', 'yearly', 'usd')).toBeNull();
  });
});

describe('compareBilledPrice', () => {
  it('agrees when the stored plan matches the price being charged', () => {
    expect(
      compareBilledPrice({
        storedPlanTier: 'pro',
        storedInterval: 'monthly',
        priceId: PRO_MONTHLY_PRICE,
        unitAmount: PRO_MONTHLY_CENTS,
        currency: 'usd',
      }).fields,
    ).toEqual([]);
  });

  it('flags a plan this deployment entitles that Stripe is not charging for', () => {
    const result = compareBilledPrice({
      storedPlanTier: 'max',
      storedInterval: 'monthly',
      priceId: PRO_MONTHLY_PRICE,
      unitAmount: PRO_MONTHLY_CENTS,
      currency: 'usd',
    });

    expect(result.fields).toEqual(['plan_tier']);
    expect(result.stripePlanTier).toBe('pro');
  });

  it('flags an amount that has drifted from the published list price', () => {
    const result = compareBilledPrice({
      storedPlanTier: 'pro',
      storedInterval: 'monthly',
      priceId: PRO_MONTHLY_PRICE,
      unitAmount: PRO_MONTHLY_CENTS - 500,
      currency: 'usd',
    });

    expect(result.fields).toEqual(['unit_amount']);
    expect(result.expected).toBe(PRO_MONTHLY_CENTS);
  });

  it('flags a billing interval that does not match the price', () => {
    expect(
      compareBilledPrice({
        storedPlanTier: 'pro',
        storedInterval: 'monthly',
        priceId: PRO_YEARLY_PRICE,
        unitAmount: null,
        currency: 'usd',
      }).fields,
    ).toEqual(['interval']);
  });

  it('flags a price this deployment does not recognise at all', () => {
    expect(
      compareBilledPrice({
        storedPlanTier: 'pro',
        storedInterval: 'monthly',
        priceId: 'price_never_registered',
        unitAmount: PRO_MONTHLY_CENTS,
        currency: 'usd',
      }).fields,
    ).toEqual(['unregistered_price']);
  });
});

describe('reconcileBilledPlans', () => {
  it('reports no drift when every subscription is charged its stored plan', async () => {
    const db = { query: vi.fn(async () => [subscriptionRow()]) };
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => stripeSubscription(PRO_MONTHLY_PRICE, PRO_MONTHLY_CENTS)),
      },
    };

    const report = await reconcileBilledPlans({
      db: db as never,
      stripe: stripe as never,
    });

    expect(report.examined).toBe(1);
    expect(report.diverged).toBe(0);
    expect(report.drifts).toEqual([]);
  });

  it('flags a mismatch between the local plan and what Stripe charges', async () => {
    const db = { query: vi.fn(async () => [subscriptionRow({ plan_tier: 'max' })]) };
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => stripeSubscription(PRO_MONTHLY_PRICE, PRO_MONTHLY_CENTS)),
      },
    };

    const report = await reconcileBilledPlans({
      db: db as never,
      stripe: stripe as never,
    });

    expect(report.diverged).toBe(1);
    expect(report.drifts[0]).toMatchObject({
      userId: 'user-1',
      stripeSubscriptionId: 'sub_1',
      storedPlanTier: 'max',
      stripePlanTier: 'pro',
      fields: ['plan_tier'],
    });
  });

  it('repairs nothing, so a divergence survives to be acted on', async () => {
    const statements: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        return [subscriptionRow({ plan_tier: 'max' })];
      }),
    };
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => stripeSubscription(PRO_MONTHLY_PRICE, PRO_MONTHLY_CENTS)),
      },
    };

    await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(statements).toHaveLength(1);
    expect(statements[0]).not.toMatch(/\b(update|insert|delete)\s/iu);
  });

  it('counts a subscription Stripe cannot return as uncomparable, not as agreement', async () => {
    const db = { query: vi.fn(async () => [subscriptionRow()]) };
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => {
          throw new Error('resource_missing');
        }),
      },
    };

    const report = await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(report.examined).toBe(0);
    expect(report.uncomparable).toBe(1);
    expect(report.diverged).toBe(0);
  });

  it('does not alert on a single divergence in a sample too small to mean anything', async () => {
    const db = { query: vi.fn(async () => [subscriptionRow({ plan_tier: 'max' })]) };
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => stripeSubscription(PRO_MONTHLY_PRICE, PRO_MONTHLY_CENTS)),
      },
    };

    const report = await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(report.alert).toBe(false);
  });

  it('alerts when a large enough sample diverges past the threshold', async () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      subscriptionRow({
        user_id: `user-${index}`,
        stripe_subscription_id: `sub_${index}`,
        plan_tier: index < 5 ? 'max' : 'pro',
      }),
    );
    const db = { query: vi.fn(async () => rows) };
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => stripeSubscription(PRO_MONTHLY_PRICE, PRO_MONTHLY_CENTS)),
      },
    };

    const report = await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(report.diverged).toBe(5);
    expect(report.alert).toBe(true);
  });
});
