import { describe, expect, it } from 'vitest';
import { planPeriodEndKind } from '../subscription-owner-presentation';

describe('planPeriodEndKind', () => {
  it('says a store or card plan that is active renews', () => {
    for (const source of ['stripe', 'apple', 'google'] as const) {
      expect(planPeriodEndKind({ subscription_source: source, status: 'active' })).toBe('renews');
    }
  });

  it('gives a plan granted without a purchase no period end while it runs', () => {
    expect(
      planPeriodEndKind({
        subscription_source: 'manual',
        status: 'active',
        cancel_at_period_end: false,
      }),
    ).toBeNull();
    expect(planPeriodEndKind({ subscription_source: 'manual', status: 'canceled' })).toBeNull();
  });

  it('says a granted plan ends only once it is set to end', () => {
    expect(
      planPeriodEndKind({
        subscription_source: 'manual',
        status: 'active',
        cancel_at_period_end: true,
      }),
    ).toBe('ends');
  });

  it('keeps the trial end of a granted trial, which the trial expiry job enforces', () => {
    expect(planPeriodEndKind({ subscription_source: 'manual', status: 'trialing' })).toBe('trial');
  });

  it('takes a live cancellation over the stored flag', () => {
    expect(
      planPeriodEndKind(
        { subscription_source: 'stripe', status: 'active', cancel_at_period_end: false },
        { endingSoon: true },
      ),
    ).toBe('ends');
  });

  it('never claims a renewal when the billing owner is not verified or the plan is past due', () => {
    expect(planPeriodEndKind({ status: 'active' })).toBe('period');
    expect(planPeriodEndKind({ subscription_source: 'stripe', status: 'past_due' })).toBe('period');
  });

  it('gives nothing for a missing subscription', () => {
    expect(planPeriodEndKind(null)).toBeNull();
  });
});
