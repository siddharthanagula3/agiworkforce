import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  assertSameCheckoutBillingInterval,
  checkoutBillingIntervalFromStripePrice,
  classifyPlanChange,
  currentSeatsFromStripeItem,
  isUpgrade,
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
      assertSameCheckoutBillingInterval(
        { interval: 'month', interval_count: 1 } as never,
        'yearly',
      ),
    ).toThrow(/charged only the prorated difference/i);
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
