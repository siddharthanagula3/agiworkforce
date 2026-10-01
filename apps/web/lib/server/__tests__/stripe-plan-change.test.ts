import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/localized-pricing-service');
type ScanModule1 = typeof import('@/lib/price-tier-mapping');

const pricing = vi.hoisted(() => ({
  getPriceSelectionForCurrency: vi.fn(),
  resolvePlanTier: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/localized-pricing-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getPriceSelectionForCurrency: pricing.getPriceSelectionForCurrency,
}));
vi.mock('@/lib/price-tier-mapping', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  resolvePlanTier: pricing.resolvePlanTier,
}));

import type Stripe from 'stripe';
import type { ManagedStripeSubscription } from '../stripe-upgrade-subscription';
import {
  assertUpgradeBillingInterval,
  checkoutBillingIntervalFromStripePrice,
  classifyPlanChange,
  currentSeatsFromStripeItem,
  isUpgrade,
  readPlanChangeState,
  scheduleDowngrade,
} from '../stripe-plan-change';

describe('Stripe billing cadence', () => {
  it('maps only one-month and one-year prices to self-serve cadences', () => {
    expect(
      checkoutBillingIntervalFromStripePrice({ interval: 'month', interval_count: 1 } as never),
    ).toBe('monthly');
    expect(
      checkoutBillingIntervalFromStripePrice({ interval: 'year', interval_count: 1 } as never),
    ).toBe('yearly');
    expect(
      checkoutBillingIntervalFromStripePrice({ interval: 'month', interval_count: 3 } as never),
    ).toBeNull();
    expect(checkoutBillingIntervalFromStripePrice(null)).toBeNull();
  });

  it('refuses a monthly-to-yearly switch on the prorated upgrade path', () => {
    expect(() =>
      assertUpgradeBillingInterval(
        { interval: 'month', interval_count: 1 } as never,
        'yearly',
        'team',
      ),
    ).toThrow(/keep your current monthly billing cadence/i);
    expect(() =>
      assertUpgradeBillingInterval(
        { interval: 'year', interval_count: 1 } as never,
        'monthly',
        'team',
      ),
    ).toThrow(/keep your current yearly billing cadence/i);
  });

  it('moves a yearly subscriber onto the monthly price of a plan sold monthly only', () => {
    expect(() =>
      assertUpgradeBillingInterval(
        { interval: 'year', interval_count: 1 } as never,
        'monthly',
        'max',
      ),
    ).not.toThrow();
    expect(() =>
      assertUpgradeBillingInterval(
        { interval: 'year', interval_count: 1 } as never,
        'monthly',
        'max_15x',
      ),
    ).not.toThrow();
  });
});

const YEARLY_PRO = {
  id: 'price_pro_yearly',
  unit_amount: 20_000,
  currency: 'usd',
  recurring: { interval: 'year', interval_count: 1 },
};
const MONTHLY_PRO = {
  id: 'price_pro_monthly',
  unit_amount: 2_000,
  currency: 'usd',
  recurring: { interval: 'month', interval_count: 1 },
};
const MONTHLY_AMOUNTS: Record<string, number> = { basic: 700, pro: 2_000, max: 10_000 };

function managedOn(
  price: typeof YEARLY_PRO,
  schedule: string | null = null,
): ManagedStripeSubscription {
  return {
    row: { plan_tier: 'pro' },
    customerId: 'cus_yearly',
    subscriptionId: 'sub_yearly',
    subscription: {
      id: 'sub_yearly',
      status: 'active',
      metadata: {},
      schedule,
      cancel_at: null,
      cancel_at_period_end: false,
      trial_start: null,
      trial_end: null,
      items: { data: [{ price, quantity: 1, current_period_end: 1_800_000_000 }] },
    },
  } as unknown as ManagedStripeSubscription;
}

describe('a yearly Pro subscription after individual plans became monthly only', () => {
  beforeEach(() => {
    pricing.resolvePlanTier.mockReset().mockReturnValue('pro');
    pricing.getPriceSelectionForCurrency
      .mockReset()
      .mockImplementation(async (plan: string, interval: string) =>
        interval === 'monthly'
          ? {
              priceId: `price_${plan}_monthly`,
              currency: 'usd',
              amountMinor: MONTHLY_AMOUNTS[plan],
            }
          : null,
      );
  });

  it('keeps renewing yearly and offers only monthly prices to move to', async () => {
    const state = await readPlanChangeState({} as Stripe, managedOn(YEARLY_PRO));

    expect(state.price).toEqual({ amountCents: 20_000, currency: 'usd', interval: 'yearly' });
    expect(state.scheduledChange).toBeNull();
    expect(state.downgradeTargets).toEqual([
      { plan: 'basic', price: { amountCents: 700, currency: 'usd', interval: 'monthly' } },
    ]);
    expect(state.cadenceSwitch).toEqual({
      plan: 'pro',
      price: { amountCents: 2_000, currency: 'usd', interval: 'monthly' },
    });
    expect(pricing.getPriceSelectionForCurrency).not.toHaveBeenCalledWith(
      expect.anything(),
      'yearly',
      expect.anything(),
    );
  });

  it('offers no cadence switch to a subscription already billed monthly', async () => {
    const state = await readPlanChangeState({} as Stripe, managedOn(MONTHLY_PRO));

    expect(state.cadenceSwitch).toBeNull();
  });

  it('schedules the switch to monthly Pro for the end of the yearly term', async () => {
    const phase = {
      start_date: 1_760_000_000,
      end_date: 1_800_000_000,
      items: [{ price: 'price_pro_yearly', quantity: 1 }],
      discounts: [],
      trial_end: null,
    };
    const stripe = {
      subscriptionSchedules: {
        create: vi.fn(async () => ({
          id: 'sub_sched_1',
          current_phase: { start_date: phase.start_date, end_date: phase.end_date },
          phases: [phase],
        })),
        update: vi.fn(async () => ({})),
      },
    };

    await scheduleDowngrade(stripe as unknown as Stripe, managedOn(YEARLY_PRO), 'pro', 'key-1');

    expect(stripe.subscriptionSchedules.update).toHaveBeenCalledWith(
      'sub_sched_1',
      expect.objectContaining({
        end_behavior: 'release',
        phases: [
          expect.objectContaining({ end_date: phase.end_date }),
          expect.objectContaining({
            items: [{ price: 'price_pro_monthly', quantity: 1 }],
            duration: { interval: 'month', interval_count: 1 },
            metadata: { plan_tier: 'pro' },
          }),
        ],
      }),
      { idempotencyKey: 'key-1:phases' },
    );
  });

  it('refuses the same switch for a subscription already billed monthly', async () => {
    await expect(
      scheduleDowngrade({} as Stripe, managedOn(MONTHLY_PRO), 'pro', 'key-2'),
    ).rejects.toThrow(/not a smaller plan/i);
  });

  it('reads a scheduled switch to monthly on the same plan as a plan change', async () => {
    const stripe = {
      subscriptionSchedules: {
        retrieve: vi.fn(async () => ({
          status: 'active',
          current_phase: { start_date: 1_760_000_000, end_date: 1_800_000_000 },
          phases: [
            {
              start_date: 1_760_000_000,
              items: [{ price: YEARLY_PRO, quantity: 1 }],
              metadata: {},
            },
            {
              start_date: 1_800_000_000,
              items: [{ price: MONTHLY_PRO, quantity: 1 }],
              metadata: { plan_tier: 'pro' },
            },
          ],
        })),
      },
    };

    const state = await readPlanChangeState(
      stripe as unknown as Stripe,
      managedOn(YEARLY_PRO, 'sub_sched_1'),
    );

    expect(state.scheduledChange).toEqual({
      plan: 'pro',
      effectiveAt: new Date(1_800_000_000 * 1000).toISOString(),
      price: { amountCents: 2_000, currency: 'usd', interval: 'monthly' },
    });
  });
});

describe('classifyPlanChange', () => {
  it('allows a strictly higher tier as a tier upgrade', () => {
    expect(
      classifyPlanChange({
        currentTier: 'pro',
        targetPlan: 'max',
        requestedSeats: 1,
        currentSeats: 1,
      }),
    ).toEqual({ allowed: true, kind: 'tier_upgrade' });
  });

  it('allows more seats on the same per-seat tier', () => {
    expect(
      classifyPlanChange({
        currentTier: 'team',
        targetPlan: 'team',
        requestedSeats: 10,
        currentSeats: 5,
      }),
    ).toEqual({ allowed: true, kind: 'seat_increase' });
  });

  it('refuses a seat reduction rather than issuing an unscoped credit', () => {
    const decision = classifyPlanChange({
      currentTier: 'team',
      targetPlan: 'team',
      requestedSeats: 3,
      currentSeats: 10,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(/billing management/i);
  });

  it('refuses a no-op seat change', () => {
    const decision = classifyPlanChange({
      currentTier: 'team',
      targetPlan: 'team',
      requestedSeats: 7,
      currentSeats: 7,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(/already has 7 seats/i);
  });

  it('refuses a same-tier "change" on a per-account plan', () => {
    const decision = classifyPlanChange({
      currentTier: 'pro',
      targetPlan: 'pro',
      requestedSeats: 1,
      currentSeats: 1,
    });
    expect(decision.allowed).toBe(false);
  });

  it('refuses a downgrade', () => {
    expect(
      classifyPlanChange({
        currentTier: 'max_15x',
        targetPlan: 'pro',
        requestedSeats: 1,
        currentSeats: 1,
      }).allowed,
    ).toBe(false);
    expect(
      classifyPlanChange({
        currentTier: 'team',
        targetPlan: 'pro',
        requestedSeats: 1,
        currentSeats: 4,
      }).allowed,
    ).toBe(false);
  });

  it('keeps the tier order both upgrade routes share', () => {
    expect(isUpgrade('pro', 'team')).toBe(true);
    expect(isUpgrade('team', 'max')).toBe(true);
    expect(isUpgrade('max', 'team')).toBe(false);
    expect(isUpgrade('free', 'basic')).toBe(true);
  });
});

describe('per-seat organization plans are fenced off the individual upgrade path', () => {
  it('refuses leaving a Team org for a personal plan, even though max ranks higher', () => {
    expect(isUpgrade('team', 'max')).toBe(true);

    const decision = classifyPlanChange({
      currentTier: 'team',
      targetPlan: 'max',
      requestedSeats: 1,
      currentSeats: 25,
    });

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toMatch(/billing management/i);
    }
  });

  it('refuses leaving a Team org for the top individual plan', () => {
    const decision = classifyPlanChange({
      currentTier: 'team',
      targetPlan: 'max_15x',
      requestedSeats: 1,
      currentSeats: 10,
    });
    expect(decision.allowed).toBe(false);
  });

  it('refuses entering Team from a personal plan, which would have no organization', () => {
    expect(isUpgrade('pro', 'team')).toBe(true);

    const decision = classifyPlanChange({
      currentTier: 'pro',
      targetPlan: 'team',
      requestedSeats: 25,
      currentSeats: 1,
    });

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toMatch(/billing management/i);
    }
  });

  it('still allows adding seats within Team', () => {
    const decision = classifyPlanChange({
      currentTier: 'team',
      targetPlan: 'team',
      requestedSeats: 30,
      currentSeats: 25,
    });
    expect(decision).toEqual({ allowed: true, kind: 'seat_increase' });
  });

  it('still allows ordinary individual upgrades', () => {
    expect(
      classifyPlanChange({
        currentTier: 'pro',
        targetPlan: 'max',
        requestedSeats: 1,
        currentSeats: 1,
      }),
    ).toEqual({ allowed: true, kind: 'tier_upgrade' });
  });
});

describe('currentSeatsFromStripeItem', () => {
  it('reads an integer quantity', () => {
    expect(currentSeatsFromStripeItem(9)).toBe(9);
  });

  it('falls back to 1 for missing or nonsensical quantities', () => {
    expect(currentSeatsFromStripeItem(null)).toBe(1);
    expect(currentSeatsFromStripeItem(undefined)).toBe(1);
    expect(currentSeatsFromStripeItem(0)).toBe(1);
    expect(currentSeatsFromStripeItem(-4)).toBe(1);
    expect(currentSeatsFromStripeItem(2.5)).toBe(1);
  });
});
