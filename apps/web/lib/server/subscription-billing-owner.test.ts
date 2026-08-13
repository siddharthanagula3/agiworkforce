import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  getSubscriptionBillingOwnerPolicy,
  resolveSubscriptionBillingSource,
} from './subscription-billing-owner';

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    plan_tier: 'pro',
    status: 'active',
    stripe_subscription_id: null,
    apple_original_transaction_id: null,
    google_purchase_token: null,
    ...overrides,
  } as never;
}

describe('subscription billing owner policy', () => {
  it.each([
    ['stripe', { stripe_subscription_id: 'sub_live123' }],
    ['apple', { apple_original_transaction_id: 'apple-tx-1' }],
    ['google', { google_purchase_token: 'play-token-1' }],
    ['manual', {}],
  ])('resolves the canonical %s owner', (source, identifiers) => {
    expect(resolveSubscriptionBillingSource(subscription(identifiers))).toBe(source);
  });

  it.each([
    { stripe_subscription_id: 'not-a-stripe-id' },
    { stripe_subscription_id: 'sub_live123', apple_original_transaction_id: 'apple-tx-1' },
    { apple_original_transaction_id: 'apple-tx-1', google_purchase_token: 'play-token-1' },
  ])('fails closed when ownership is contradictory or malformed', (identifiers) => {
    const policy = getSubscriptionBillingOwnerPolicy(subscription(identifiers));

    expect(policy.source).toBe('unverified');
    expect(policy.canOpenStripePortal).toBe(false);
    expect(policy.canApplyStripeUpgrade).toBe(false);
    expect(policy.canStartStripeCheckout).toBe(false);
  });

  it.each(['apple_original_transaction_id', 'google_purchase_token'])(
    'allows a new checkout only after the %s subscription is terminal',
    (column) => {
      const active = getSubscriptionBillingOwnerPolicy(
        subscription({ [column]: 'store-id', status: 'past_due' }),
      );
      const ended = getSubscriptionBillingOwnerPolicy(
        subscription({ [column]: 'store-id', status: 'expired' }),
      );

      expect(active.canStartStripeCheckout).toBe(false);
      expect(ended.canStartStripeCheckout).toBe(true);
      expect(ended.canOpenStripePortal).toBe(false);
      expect(ended.canApplyStripeUpgrade).toBe(false);
    },
  );

  it('allows a terminal organization-managed entitlement to start fresh checkout', () => {
    const policy = getSubscriptionBillingOwnerPolicy(subscription({ status: 'canceled' }));

    expect(policy.source).toBe('manual');
    expect(policy.canStartStripeCheckout).toBe(true);
  });

  it('allows a legacy store row after its paid-through period and renewal grace elapsed', () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const policy = getSubscriptionBillingOwnerPolicy(
      subscription({
        status: 'active',
        apple_original_transaction_id: 'apple-tx-legacy',
        current_period_end: '2026-08-09T11:59:59.000Z',
      }),
      now,
    );

    expect(policy.status).toBe('expired');
    expect(policy.canStartStripeCheckout).toBe(true);
  });

  it('does not mistake an active free row for an organization-managed paid plan', () => {
    const policy = getSubscriptionBillingOwnerPolicy(
      subscription({ plan_tier: 'free', status: 'active' }),
    );

    expect(policy.source).toBe('none');
    expect(policy.canStartStripeCheckout).toBe(true);
  });

  it('requires a past-due Stripe plan to recover before a prorated upgrade', () => {
    const policy = getSubscriptionBillingOwnerPolicy(
      subscription({ stripe_subscription_id: 'sub_live123', status: 'past_due' }),
    );

    expect(policy.canOpenStripePortal).toBe(true);
    expect(policy.canApplyStripeUpgrade).toBe(false);
    expect(policy.canStartStripeCheckout).toBe(false);
  });
});
