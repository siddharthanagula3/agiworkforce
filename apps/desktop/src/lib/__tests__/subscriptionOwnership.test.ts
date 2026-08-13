import { describe, expect, it } from 'vitest';
import { getDesktopSubscriptionOwnerPolicy } from '../subscriptionOwnership';

describe('Desktop subscription ownership', () => {
  it('allows Stripe-owned subscriptions to use both plan changes and the portal', () => {
    const policy = getDesktopSubscriptionOwnerPolicy('stripe', 'active', true);

    expect(policy.canOpenStripePortal).toBe(true);
    expect(policy.canStartStripePlanChange).toBe(true);
    expect(policy.stripeActionBlockedReason).toBeNull();
  });

  it.each([
    ['apple', 'Apple'],
    ['google', 'Google Play'],
    ['manual', 'Your organization'],
    ['unknown', 'Another platform'],
  ] as const)('fails closed for an active %s-owned subscription', (source, label) => {
    const policy = getDesktopSubscriptionOwnerPolicy(source, 'active', true);

    expect(policy.sourceLabel).toBe(label);
    expect(policy.canOpenStripePortal).toBe(false);
    expect(policy.canStartStripePlanChange).toBe(false);
    expect(policy.stripeActionBlockedReason).toBeTruthy();
  });

  it('allows a new web checkout after a non-Stripe subscription is terminal', () => {
    const policy = getDesktopSubscriptionOwnerPolicy('apple', 'canceled', true);

    expect(policy.canOpenStripePortal).toBe(false);
    expect(policy.canStartStripePlanChange).toBe(true);
  });

  it('blocks every Stripe action while ownership has not been verified', () => {
    const policy = getDesktopSubscriptionOwnerPolicy('none', 'none', false);

    expect(policy.canOpenStripePortal).toBe(false);
    expect(policy.canStartStripePlanChange).toBe(false);
    expect(policy.description).toMatch(/could not be verified/i);
  });
});
