import {
  billingManagementTarget,
  getSubscriptionOwnerGuard,
  subscriptionManagementUrl,
  subscriptionSourceLabel,
} from '@/src/features/billing/subscriptionSource';
import { storeDisplayNameOf, storeSubscriptionManagementUrlOf } from '@/src/features/release-state';

describe('subscription owner guard', () => {
  it('routes every entitled subscription to its recorded owner', () => {
    expect(getSubscriptionOwnerGuard('stripe', 'active', true)).toMatchObject({
      blocked: true,
      sourceLabel: 'AGI Workforce on the web',
      managementUrl: 'https://agiworkforce.com/settings/billing',
      managementActionLabel: 'Manage on web',
    });
    expect(getSubscriptionOwnerGuard('google', 'trialing', false).blocked).toBe(true);
    expect(getSubscriptionOwnerGuard('unknown', 'active', false).blocked).toBe(true);
  });

  it('names no web destination where the store forbids linking to web billing', () => {
    for (const source of ['stripe', 'manual'] as const) {
      expect(getSubscriptionOwnerGuard(source, 'active', false)).toMatchObject({
        blocked: true,
        managementUrl: null,
        managementActionLabel: 'OK',
      });
      for (const portalEnabled of [true, false]) {
        expect(
          billingManagementTarget({ source, portalEnabled, webBillingLinksAllowed: false }),
        ).toBeNull();
      }
    }
  });

  it('keeps a past-due subscription locked to its recorded owner', () => {
    expect(getSubscriptionOwnerGuard('apple', 'past_due', false).blocked).toBe(true);
    expect(getSubscriptionOwnerGuard('stripe', 'past_due', false).blocked).toBe(true);
  });

  it('blocks a store-sourced subscription without claiming the store', () => {
    expect(getSubscriptionOwnerGuard('apple', 'active', false)).toMatchObject({
      blocked: true,
      sourceLabel: 'another platform',
      managementUrl: null,
      managementActionLabel: 'OK',
    });
    expect(getSubscriptionOwnerGuard('google', 'active', false)).toMatchObject({
      blocked: true,
      sourceLabel: 'another platform',
      managementUrl: null,
      managementActionLabel: 'OK',
    });
  });

  it('does not block when there is no entitled subscription', () => {
    expect(getSubscriptionOwnerGuard('none', 'none', false).blocked).toBe(false);
    expect(getSubscriptionOwnerGuard('stripe', 'canceled', false).blocked).toBe(false);
  });

  it('provides management destinations without inventing one for unknown ownership', () => {
    expect(subscriptionManagementUrl('apple')).toBeNull();
    expect(subscriptionManagementUrl('google')).toBeNull();
    expect(subscriptionManagementUrl('unknown')).toBeNull();
    expect(subscriptionManagementUrl('manual')).toBe('https://agiworkforce.com/settings/billing');
    expect(subscriptionSourceLabel('manual')).toBe('your organization');
    expect(subscriptionSourceLabel('apple')).toBe('another platform');
    expect(subscriptionSourceLabel('google')).toBe('another platform');
  });

  it('reads the store attribution from the release-state registry, not from itself', () => {
    const registryApple = {
      store: 'apple',
      status: 'published',
      productionId: 'com.agiworkforce.app',
      listingId: '1234567890',
      listingUrl: 'https://apps.apple.com/us/app/agi/id1234567890',
      subscriptionManagementUrl: 'https://apps.apple.com/account/subscriptions',
      evidence: 'test fixture',
    } as const;

    expect(storeDisplayNameOf(registryApple)).toBe('the Apple App Store');
    expect(storeSubscriptionManagementUrlOf(registryApple)).toBe(
      'https://apps.apple.com/account/subscriptions',
    );
  });
});

describe('billing management target', () => {
  it('uses the hosted portal only for a web-billed account on a build that ships it', () => {
    expect(
      billingManagementTarget({
        source: 'stripe',
        portalEnabled: true,
        webBillingLinksAllowed: true,
      }),
    ).toEqual({
      kind: 'portal',
    });
    expect(
      billingManagementTarget({
        source: 'manual',
        portalEnabled: true,
        webBillingLinksAllowed: true,
      }),
    ).toEqual({
      kind: 'portal',
    });
  });

  it('sends a web-billed account to the web without the portal', () => {
    expect(
      billingManagementTarget({
        source: 'stripe',
        portalEnabled: false,
        webBillingLinksAllowed: true,
      }),
    ).toEqual({
      kind: 'external',
      url: 'https://agiworkforce.com/settings/billing',
      label: 'Manage billing on the web',
    });
  });

  it('never sends a store-billed subscription to the portal', () => {
    for (const source of ['apple', 'google'] as const) {
      const target = billingManagementTarget({
        source,
        portalEnabled: true,
        webBillingLinksAllowed: false,
      });
      expect(target?.kind).not.toBe('portal');
      const url = subscriptionManagementUrl(source);
      if (url === null) {
        expect(target).toBeNull();
      } else {
        expect(target).toMatchObject({ kind: 'external', url });
      }
    }
  });

  it('offers nothing when no owner is recorded', () => {
    expect(
      billingManagementTarget({
        source: 'none',
        portalEnabled: true,
        webBillingLinksAllowed: true,
      }),
    ).toBeNull();
    expect(
      billingManagementTarget({
        source: 'unknown',
        portalEnabled: true,
        webBillingLinksAllowed: true,
      }),
    ).toBeNull();
  });
});
