import { describe, expect, it } from 'vitest';
import { isActiveSubscriptionStatus } from '@/lib/constants';
import {
  SUBSCRIPTION_STATE_LADDER,
  CHARGEBACK_STORED_STATUS,
  resolveSubscriptionAccess,
  subscriptionAccessRank,
  isMonotonicSubscriptionTransition,
  hasLiveBillingRelationship,
} from '@/lib/services/subscription-access-policy';

const ACCESS_KEYS = [
  'managedExecution',
  'planFeatures',
  'purchasedCreditSpend',
  'planChange',
] as const;

const PLAN_TIERS = ['free', 'plus', 'pro', 'max', 'enterprise'];

describe('subscription access policy · ladder', () => {
  it('ranks every stored subscription status the billing surfaces can write', () => {
    const ranked = SUBSCRIPTION_STATE_LADDER.map((state) => state.status);
    for (const status of [
      'active',
      'trialing',
      'incomplete',
      'past_due',
      'unpaid',
      'paused',
      'canceled',
      'cancelled',
      'expired',
      'incomplete_expired',
      'none',
    ]) {
      expect(ranked).toContain(status);
    }
  });

  it('treats an unknown status as the lowest rank rather than granting access', () => {
    expect(subscriptionAccessRank('something_stripe_added_later')).toBe(0);
    const access = resolveSubscriptionAccess('something_stripe_added_later', 'max');
    for (const key of ACCESS_KEYS) expect(access[key]).toBe(false);
    expect(access.effectivePlanTier).toBe('free');
  });
});

describe('subscription access policy · monotonic access', () => {
  it('never grants more access as the ladder descends, on every plan tier', () => {
    for (const planTier of PLAN_TIERS) {
      for (let index = 1; index < SUBSCRIPTION_STATE_LADDER.length; index += 1) {
        const higher = SUBSCRIPTION_STATE_LADDER[index - 1]!;
        const lower = SUBSCRIPTION_STATE_LADDER[index]!;
        expect(subscriptionAccessRank(higher.status)).toBeGreaterThanOrEqual(
          subscriptionAccessRank(lower.status),
        );

        const above = resolveSubscriptionAccess(higher.status, planTier);
        const below = resolveSubscriptionAccess(lower.status, planTier);
        for (const key of ACCESS_KEYS) {
          expect(
            above[key] || !below[key],
            `${lower.status} granted ${key} that ${higher.status} does not on ${planTier}`,
          ).toBe(true);
        }
      }
    }
  });

  it('degrades the effective plan tier to free below the entitled rank', () => {
    for (const state of SUBSCRIPTION_STATE_LADDER) {
      const access = resolveSubscriptionAccess(state.status, 'max');
      expect(access.effectivePlanTier).toBe(access.planFeatures ? 'max' : 'free');
    }
  });

  it('accepts descending transitions and rejects silent re-entitlement', () => {
    expect(isMonotonicSubscriptionTransition('active', 'past_due')).toBe(true);
    expect(isMonotonicSubscriptionTransition('past_due', 'canceled')).toBe(true);
    expect(isMonotonicSubscriptionTransition('canceled', 'active')).toBe(false);
    expect(isMonotonicSubscriptionTransition('past_due', 'active')).toBe(false);
  });
});

describe('subscription access policy · disputes and chargebacks', () => {
  it('stores a chargeback as a strictly lower-access state than active', () => {
    const disputed = resolveSubscriptionAccess(CHARGEBACK_STORED_STATUS, 'pro');
    const active = resolveSubscriptionAccess('active', 'pro');

    expect(subscriptionAccessRank(CHARGEBACK_STORED_STATUS)).toBeLessThan(
      subscriptionAccessRank('active'),
    );
    expect(active.managedExecution).toBe(true);
    expect(disputed.managedExecution).toBe(false);
    expect(disputed.purchasedCreditSpend).toBe(false);
    expect(disputed.planFeatures).toBe(false);
  });

  it('never lets a disputed account keep spending purchased credits', () => {
    for (const planTier of PLAN_TIERS) {
      expect(
        resolveSubscriptionAccess(CHARGEBACK_STORED_STATUS, planTier).purchasedCreditSpend,
      ).toBe(false);
    }
  });
});

describe('subscription access policy · live billing relationship', () => {
  it('separates "still owes or still billing" from "entitled"', () => {
    for (const status of ['active', 'trialing', 'past_due', 'incomplete']) {
      expect(
        hasLiveBillingRelationship(status),
        `${status} still has a live billing relationship`,
      ).toBe(true);
    }
    for (const status of ['unpaid', 'canceled', 'expired', 'incomplete_expired', 'none']) {
      expect(hasLiveBillingRelationship(status), `${status} has no live billing relationship`).toBe(
        false,
      );
    }
    expect(resolveSubscriptionAccess('past_due', 'pro').managedExecution).toBe(false);
  });
});

describe('subscription access policy · single definition of active', () => {
  it('does not report a disputed or delinquent subscription as active', () => {
    expect(isActiveSubscriptionStatus('active')).toBe(true);
    expect(isActiveSubscriptionStatus('trialing')).toBe(true);
    expect(isActiveSubscriptionStatus('past_due')).toBe(false);
    expect(isActiveSubscriptionStatus('unpaid')).toBe(false);
    expect(isActiveSubscriptionStatus('canceled')).toBe(false);
  });
});
