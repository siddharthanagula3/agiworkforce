import { describe, expect, it } from 'vitest';

import {
  effectivePlanTier,
  isEntitledEnterpriseSubscriptionStatus,
  isEntitledSubscriptionStatus,
  isEntitledSubscriptionStatusForTier,
} from '../subscription-entitlement';

describe('isEntitledSubscriptionStatus', () => {
  it('entitles active and trialing only', () => {
    expect(isEntitledSubscriptionStatus('active')).toBe(true);
    expect(isEntitledSubscriptionStatus('trialing')).toBe(true);
    expect(isEntitledSubscriptionStatus('past_due')).toBe(false);
    expect(isEntitledSubscriptionStatus('canceled')).toBe(false);
    expect(isEntitledSubscriptionStatus(null)).toBe(false);
    expect(isEntitledSubscriptionStatus(undefined)).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isEntitledSubscriptionStatus('ACTIVE')).toBe(true);
  });
});

describe('isEntitledEnterpriseSubscriptionStatus', () => {
  it('stays entitled while past due and the collection stage is not read_only', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('past_due', false)).toBe(true);
  });

  it('loses entitlement once the collection stage reaches read_only while past due', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('past_due', true)).toBe(false);
  });

  it('stays entitled while unpaid and the collection stage is not read_only', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('unpaid', false)).toBe(true);
  });

  it('loses entitlement once the collection stage reaches read_only while unpaid', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('unpaid', true)).toBe(false);
  });

  it('is case insensitive on the grace statuses', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('UNPAID', false)).toBe(true);
    expect(isEntitledEnterpriseSubscriptionStatus('Past_Due', false)).toBe(true);
  });

  it('defers to the ordinary ladder for every other status while not read_only', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('active', false)).toBe(true);
    expect(isEntitledEnterpriseSubscriptionStatus('trialing', false)).toBe(true);
  });

  it('loses entitlement on an active status once the collection stage reaches read_only', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('active', true)).toBe(false);
  });

  it('loses entitlement on a trialing status once the collection stage reaches read_only', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('trialing', true)).toBe(false);
  });

  it('ends entitlement on a canceled status regardless of the collection stage', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('canceled', false)).toBe(false);
    expect(isEntitledEnterpriseSubscriptionStatus('canceled', true)).toBe(false);
  });
});

describe('isEntitledSubscriptionStatusForTier', () => {
  it('applies the enterprise grace rule only to the enterprise tier', () => {
    expect(isEntitledSubscriptionStatusForTier('enterprise', 'past_due', false)).toBe(true);
    expect(isEntitledSubscriptionStatusForTier('enterprise', 'past_due', true)).toBe(false);
    expect(isEntitledSubscriptionStatusForTier('enterprise', 'unpaid', false)).toBe(true);
    expect(isEntitledSubscriptionStatusForTier('enterprise', 'unpaid', true)).toBe(false);
  });

  it('blocks an active enterprise subscription once the collection stage is read_only, regardless of Stripe status', () => {
    expect(isEntitledSubscriptionStatusForTier('enterprise', 'active', true)).toBe(false);
    expect(isEntitledSubscriptionStatusForTier('enterprise', 'active', false)).toBe(true);
  });

  it('ends entitlement for a canceled enterprise subscription even when not read_only', () => {
    expect(isEntitledSubscriptionStatusForTier('enterprise', 'canceled', false)).toBe(false);
  });

  it('is case insensitive on the tier name', () => {
    expect(isEntitledSubscriptionStatusForTier('Enterprise', 'past_due', false)).toBe(true);
  });

  it('leaves every non-enterprise tier on the ordinary ladder', () => {
    for (const tier of ['free', 'basic', 'pro', 'max', 'max_15x', 'team']) {
      expect(isEntitledSubscriptionStatusForTier(tier, 'past_due', false)).toBe(false);
      expect(isEntitledSubscriptionStatusForTier(tier, 'unpaid', false)).toBe(false);
      expect(isEntitledSubscriptionStatusForTier(tier, 'active', false)).toBe(true);
    }
  });

  it('is unaffected by collectionReadOnly for non-enterprise tiers', () => {
    expect(isEntitledSubscriptionStatusForTier('pro', 'active', true)).toBe(true);
  });
});

describe('effectivePlanTier', () => {
  it('drops to free once entitlement is lost', () => {
    expect(effectivePlanTier('pro', 'canceled')).toBe('free');
    expect(effectivePlanTier('pro', 'active')).toBe('pro');
  });
});
