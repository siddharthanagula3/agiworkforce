import { describe, it, expect } from 'vitest';
import {
  effectivePlanTier,
  isEntitledStatus,
  ENTITLED_SUBSCRIPTION_STATUSES,
} from '@/lib/entitlement';

describe('entitlement · isEntitledStatus', () => {
  it.each(['active', 'trialing'])('grants entitlement for status: %s', (status) => {
    expect(isEntitledStatus(status)).toBe(true);
  });

  it.each([
    'canceled',
    'unpaid',
    'past_due',
    'incomplete',
    'incomplete_expired',
    'paused',
    'none',
    '',
    null,
    undefined,
  ])('withholds entitlement for status: %s', (status) => {
    expect(isEntitledStatus(status as string | null | undefined)).toBe(false);
  });

  it('only lists active + trialing as entitled', () => {
    expect([...ENTITLED_SUBSCRIPTION_STATUSES].sort()).toEqual(['active', 'trialing']);
  });
});

describe('entitlement · effectivePlanTier', () => {
  it('keeps the paid tier while active or trialing', () => {
    expect(effectivePlanTier('pro', 'active')).toBe('pro');
    expect(effectivePlanTier('max', 'trialing')).toBe('max');
  });

  it('downgrades a paid tier to free once the status is no longer entitled', () => {
    // The abuse vector: plan_tier is re-derived from the still-paid Stripe price
    // on every webhook update, so a canceled row keeps a paid plan_tier. Feature
    // gating must ignore that and treat the user as free.
    expect(effectivePlanTier('pro', 'canceled')).toBe('free');
    expect(effectivePlanTier('max', 'unpaid')).toBe('free');
    expect(effectivePlanTier('pro', 'past_due')).toBe('free');
  });

  it('is free when there is no plan tier at all', () => {
    expect(effectivePlanTier(null, 'active')).toBe('free');
    expect(effectivePlanTier(undefined, 'active')).toBe('free');
    expect(effectivePlanTier('', 'active')).toBe('free');
  });

  it('a canceled subscription with cancel_at_period_end still active is fully entitled', () => {
    // "Runs to billing end": while Stripe status is still active (cancel scheduled
    // for period end), the user keeps their paid tier. Downgrade only happens when
    // status flips to canceled at the terminal deleted event.
    expect(effectivePlanTier('pro', 'active')).toBe('pro');
  });
});
