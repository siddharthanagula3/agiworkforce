/**
 * CRIT-007. Mobile sells nothing, so this module only ever *attributes*
 * ownership of an existing subscription. It used to hardcode "the Apple App
 * Store" / "Google Play" and their store URLs — distribution claims for stores
 * AGI has never shipped on. Both facts now come from the release-state
 * registry, which fails closed, so an `apple`/`google` source degrades to
 * neutral wording with no link while no listing is verified.
 *
 * The guard must still BLOCK either way: an owner we cannot name must never
 * become a second purchase path.
 */
import {
  getSubscriptionOwnerGuard,
  subscriptionManagementUrl,
  subscriptionSourceLabel,
} from '@/src/features/billing/subscriptionSource';
import { storeDisplayNameOf, storeSubscriptionManagementUrlOf } from '@/lib/releaseState';

describe('subscription owner guard', () => {
  it('routes every entitled subscription to its recorded owner', () => {
    expect(getSubscriptionOwnerGuard('stripe', 'active')).toMatchObject({
      blocked: true,
      sourceLabel: 'AGI Workforce on the web',
      managementUrl: 'https://agiworkforce.com/settings/billing',
      managementActionLabel: 'Manage on web',
    });
    expect(getSubscriptionOwnerGuard('google', 'trialing').blocked).toBe(true);
    expect(getSubscriptionOwnerGuard('unknown', 'active').blocked).toBe(true);
  });

  it('blocks a store-sourced subscription without claiming the store', () => {
    // No verified listing exists for either store, so the guard must not name
    // one and must not hand out a store link — but it still blocks.
    expect(getSubscriptionOwnerGuard('apple', 'active')).toMatchObject({
      blocked: true,
      sourceLabel: 'another platform',
      managementUrl: null,
      managementActionLabel: 'OK',
    });
    expect(getSubscriptionOwnerGuard('google', 'active')).toMatchObject({
      blocked: true,
      sourceLabel: 'another platform',
      managementUrl: null,
      managementActionLabel: 'OK',
    });
  });

  it('does not block when there is no entitled subscription', () => {
    expect(getSubscriptionOwnerGuard('none', 'none').blocked).toBe(false);
    expect(getSubscriptionOwnerGuard('stripe', 'canceled').blocked).toBe(false);
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
    // The day a store is genuinely published with a verified listing id, the
    // registry — and therefore this module — starts naming it and linking it.
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
