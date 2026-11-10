import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const PRO_MONTHLY_PRICE = 'price_pro_monthly_test';
const PRO_YEARLY_PRICE = 'price_pro_yearly_test';
const MAX_MONTHLY_PRICE = 'price_max_monthly_test';

const TEAM_STANDARD_PRICE = 'price_team_standard_test';
const TEAM_PREMIUM_PRICE = 'price_team_premium_test';

const mocks = vi.hoisted(() => ({ getTierMapping: vi.fn(), getPricePoint: vi.fn() }));
vi.mock('@/lib/price-tier-mapping', () => ({ getTierMapping: mocks.getTierMapping }));
vi.mock('@/lib/pricing', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  getPricePointForPriceId: mocks.getPricePoint,
}));

import {
  compareBilledPrice,
  expectedUnitAmount,
  reconcileBilledPlans,
  requeueSubscriptionsForReview,
} from '../billing-reconciliation';

const PRO_MONTHLY_CENTS = 20_00;
const MAX_MONTHLY_CENTS = 100_00;

const MONTHLY = { interval: 'month', interval_count: 1 };

function stripeItem(
  priceId: string,
  unitAmount: number | null,
  currency = 'usd',
  recurring: { interval: string; interval_count: number } | null | undefined = MONTHLY,
) {
  return { price: { id: priceId, unit_amount: unitAmount, currency, recurring } };
}

function stripeSubscription(priceId: string, unitAmount: number, currency = 'usd') {
  return { items: { data: [stripeItem(priceId, unitAmount, currency)] } };
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

function fakeDb(rows: unknown[]) {
  return { query: vi.fn(async (_sql: string) => rows), execute: vi.fn(async () => rows.length) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTierMapping.mockReturnValue({
    [PRO_MONTHLY_PRICE]: { tier: 'pro', interval: 'monthly' },
    [PRO_YEARLY_PRICE]: { tier: 'pro', interval: 'yearly' },
    [MAX_MONTHLY_PRICE]: { tier: 'max', interval: 'monthly' },
    [TEAM_STANDARD_PRICE]: { tier: 'team', interval: 'monthly' },
    [TEAM_PREMIUM_PRICE]: { tier: 'team', interval: 'monthly' },
  });
  mocks.getPricePoint.mockImplementation((priceId: string) => {
    if (priceId === TEAM_STANDARD_PRICE) return { plan: 'team' };
    if (priceId === TEAM_PREMIUM_PRICE) return { plan: 'team_premium' };
    return null;
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
        recurring: { interval: 'month', intervalCount: 1 },
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
      recurring: { interval: 'month', intervalCount: 1 },
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
      recurring: { interval: 'month', intervalCount: 1 },
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
        recurring: { interval: 'month', intervalCount: 1 },
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
        recurring: { interval: 'month', intervalCount: 1 },
      }).fields,
    ).toEqual(['unregistered_price']);
  });
});

describe('reconcileBilledPlans', () => {
  it('reports no drift when every subscription is charged its stored plan', async () => {
    const db = fakeDb([subscriptionRow()]);
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
    const db = fakeDb([subscriptionRow({ plan_tier: 'max' })]);
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
      fields: ['plan_tier'],
      lines: [{ priceId: PRO_MONTHLY_PRICE, stripePlanTier: 'pro', fields: ['plan_tier'] }],
    });
  });

  it('repairs nothing, so a divergence survives to be acted on', async () => {
    const db = fakeDb([subscriptionRow({ plan_tier: 'max' })]);
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => stripeSubscription(PRO_MONTHLY_PRICE, PRO_MONTHLY_CENTS)),
      },
    };

    await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0]?.[0]).not.toMatch(/\b(update|insert|delete)\s/iu);
    expect(db.execute).toHaveBeenCalledTimes(1);
    const [stamp] = db.execute.mock.calls[0] as unknown as [string];
    expect(stamp).toMatch(/set stripe_price_reconciled_at = now\(\)\s+where/iu);
    expect(stamp).not.toMatch(/plan_tier|billing_interval|status/iu);
  });

  it('reads the least recently compared subscriptions first and stamps every row it read', async () => {
    const db = fakeDb([
      subscriptionRow({ stripe_subscription_id: 'sub_read' }),
      subscriptionRow({ user_id: 'user-2', stripe_subscription_id: 'sub_unreadable' }),
    ]);
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async (id: string) => {
          if (id === 'sub_unreadable') throw new Error('stripe unavailable');
          return stripeSubscription(PRO_MONTHLY_PRICE, PRO_MONTHLY_CENTS);
        }),
      },
    };

    await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(db.query.mock.calls[0]?.[0]).toMatch(
      /order by stripe_price_reconciled_at asc nulls first/iu,
    );
    expect(db.execute.mock.calls[0]).toEqual([
      expect.any(String),
      [['sub_read', 'sub_unreadable']],
    ]);
  });

  it('stamps nothing when there is nothing to compare', async () => {
    const db = fakeDb([]);
    const stripe = { subscriptions: { retrieve: vi.fn() } };

    await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(db.execute).not.toHaveBeenCalled();
  });

  it('counts a subscription Stripe cannot return as uncomparable, not as agreement', async () => {
    const db = fakeDb([subscriptionRow()]);
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
    const db = fakeDb([subscriptionRow({ plan_tier: 'max' })]);
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
    const db = fakeDb(rows);
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

describe('provider cadence', () => {
  it('flags a price that bills every three months under a monthly price id', () => {
    const result = compareBilledPrice({
      storedPlanTier: 'pro',
      storedInterval: 'monthly',
      priceId: PRO_MONTHLY_PRICE,
      unitAmount: PRO_MONTHLY_CENTS,
      currency: 'usd',
      recurring: { interval: 'month', intervalCount: 3 },
    });

    expect(result.fields).toEqual(['interval']);
  });

  it('flags a yearly cadence behind a monthly price id even when the stored interval agrees', () => {
    const result = compareBilledPrice({
      storedPlanTier: 'pro',
      storedInterval: 'monthly',
      priceId: PRO_MONTHLY_PRICE,
      unitAmount: PRO_MONTHLY_CENTS,
      currency: 'usd',
      recurring: { interval: 'year', intervalCount: 1 },
    });

    expect(result.fields).toEqual(['interval']);
  });

  it('records a missing cadence as not compared instead of agreement', () => {
    const result = compareBilledPrice({
      storedPlanTier: 'pro',
      storedInterval: 'monthly',
      priceId: PRO_MONTHLY_PRICE,
      unitAmount: PRO_MONTHLY_CENTS,
      currency: 'usd',
      recurring: null,
    });

    expect(result.fields).toEqual([]);
    expect(result.gaps).toEqual(['provider_cadence_unavailable']);
  });
});

describe('comparison coverage', () => {
  const base = {
    storedPlanTier: 'pro',
    storedInterval: 'monthly' as const,
    priceId: PRO_MONTHLY_PRICE,
    unitAmount: PRO_MONTHLY_CENTS,
    currency: 'usd',
    recurring: { interval: 'month', intervalCount: 1 },
  };

  it('has no gaps when every dimension was compared', () => {
    expect(compareBilledPrice(base).gaps).toEqual([]);
  });

  it('names each dimension that could not be compared', () => {
    expect(compareBilledPrice({ ...base, storedInterval: null }).gaps).toEqual([
      'stored_interval_unknown',
    ]);
    expect(compareBilledPrice({ ...base, currency: 'eur' }).gaps).toEqual(['no_published_price']);
    expect(compareBilledPrice({ ...base, currency: null }).gaps).toEqual(['currency_unavailable']);
    expect(compareBilledPrice({ ...base, unitAmount: null }).gaps).toEqual([
      'unit_amount_unavailable',
    ]);
  });

  it('lists a subscription whose price was only compared in part', async () => {
    const db = fakeDb([subscriptionRow({ billing_interval: null })]);
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          items: {
            data: [stripeItem(PRO_MONTHLY_PRICE, PRO_MONTHLY_CENTS, 'usd', null)],
          },
        })),
      },
    };

    const report = await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(report.examined).toBe(1);
    expect(report.diverged).toBe(0);
    expect(report.incomplete).toEqual([
      {
        stripeSubscriptionId: 'sub_1',
        userId: 'user-1',
        gaps: ['stored_interval_unknown', 'provider_cadence_unavailable'],
      },
    ]);
  });
});

describe('mixed team seat subscriptions', () => {
  const TEAM_STANDARD_CENTS = expectedUnitAmount('team', 'monthly', 'usd') as number;

  function teamRow() {
    return subscriptionRow({ plan_tier: 'team', billing_interval: 'monthly' });
  }

  it('compares the premium line when the standard line agrees', async () => {
    const db = fakeDb([teamRow()]);
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          items: {
            data: [
              stripeItem(TEAM_STANDARD_PRICE, TEAM_STANDARD_CENTS),
              stripeItem(TEAM_PREMIUM_PRICE, 1),
            ],
          },
        })),
      },
    };

    const report = await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(report.diverged).toBe(1);
    expect(report.drifts[0]).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      fields: ['unit_amount'],
      lines: [{ priceId: TEAM_PREMIUM_PRICE, fields: ['unit_amount'], stripeUnitAmount: 1 }],
    });
  });

  it('reports one divergence for a subscription whose two lines both drift', async () => {
    const db = fakeDb([teamRow()]);
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          items: {
            data: [stripeItem(TEAM_STANDARD_PRICE, 1), stripeItem(TEAM_PREMIUM_PRICE, 1)],
          },
        })),
      },
    };

    const report = await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(report.diverged).toBe(1);
    expect(report.drifts[0]?.lines.map((line) => line.priceId)).toEqual([
      TEAM_STANDARD_PRICE,
      TEAM_PREMIUM_PRICE,
    ]);
  });

  it('does not compare a line that is not a team seat', async () => {
    const db = fakeDb([teamRow()]);
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({
          items: {
            data: [
              stripeItem(TEAM_STANDARD_PRICE, TEAM_STANDARD_CENTS),
              stripeItem('price_unrelated_addon', 1),
            ],
          },
        })),
      },
    };

    const report = await reconcileBilledPlans({ db: db as never, stripe: stripe as never });

    expect(report.diverged).toBe(0);
  });
});

describe('requeueSubscriptionsForReview', () => {
  it('clears the review stamp of exactly the named subscriptions', async () => {
    const db = fakeDb([]);

    await requeueSubscriptionsForReview(db as never, ['sub_a', 'sub_b']);

    const [sql, params] = db.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(
      /set stripe_price_reconciled_at = null\s+where stripe_subscription_id = any/iu,
    );
    expect(params).toEqual([['sub_a', 'sub_b']]);
  });

  it('writes nothing when there is nothing to queue', async () => {
    const db = fakeDb([]);

    await requeueSubscriptionsForReview(db as never, []);

    expect(db.execute).not.toHaveBeenCalled();
  });
});

type ImportedModule0 = typeof import('@/lib/pricing');
