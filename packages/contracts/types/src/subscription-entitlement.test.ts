import { describe, expect, it } from 'vitest';

import {
  effectivePlanTier,
  isEntitledEnterpriseSubscriptionStatus,
  isEntitledSubscriptionStatus,
  isEntitledSubscriptionStatusForTier,
} from './subscription-entitlement';

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

  it('loses entitlement once the collection stage reaches read_only', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('past_due', true)).toBe(false);
  });

  it('defers to the ordinary ladder for every other status', () => {
    expect(isEntitledEnterpriseSubscriptionStatus('active', false)).toBe(true);
    expect(isEntitledEnterpriseSubscriptionStatus('active', true)).toBe(true);
    expect(isEntitledEnterpriseSubscriptionStatus('canceled', false)).toBe(false);
    expect(isEntitledEnterpriseSubscriptionStatus('unpaid', false)).toBe(false);
  });
});

describe('isEntitledSubscriptionStatusForTier', () => {
  it('applies the enterprise grace rule only to the enterprise tier', () => {
    expect(isEntitledSubscriptionStatusForTier('enterprise', 'past_due', false)).toBe(true);
    expect(isEntitledSubscriptionStatusForTier('enterprise', 'past_due', true)).toBe(false);
  });

  it('is case insensitive on the tier name', () => {
    expect(isEntitledSubscriptionStatusForTier('Enterprise', 'past_due', false)).toBe(true);
  });

  it('leaves every non-enterprise tier on the ordinary ladder', () => {
    for (const tier of ['free', 'basic', 'pro', 'max', 'max_15x', 'team']) {
      expect(isEntitledSubscriptionStatusForTier(tier, 'past_due', false)).toBe(false);
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
