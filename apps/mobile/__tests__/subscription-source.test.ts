import {
  getSubscriptionOwnerGuard,
  subscriptionManagementUrl,
  subscriptionSourceLabel,
} from '@/src/features/billing/subscriptionSource';

describe('subscription owner guard', () => {
  it('routes every entitled subscription to its recorded owner', () => {
    expect(getSubscriptionOwnerGuard('stripe', 'active')).toMatchObject({
      blocked: true,
      sourceLabel: 'AGI Workforce on the web',
      managementUrl: 'https://agiworkforce.com/settings/billing',
      managementActionLabel: 'Manage on web',
    });
    expect(getSubscriptionOwnerGuard('apple', 'active')).toMatchObject({
      blocked: true,
      managementUrl: 'https://apps.apple.com/account/subscriptions',
      managementActionLabel: 'Open subscriptions',
    });
    expect(getSubscriptionOwnerGuard('google', 'trialing').blocked).toBe(true);
    expect(getSubscriptionOwnerGuard('unknown', 'active').blocked).toBe(true);
  });

  it('does not block when there is no entitled subscription', () => {
    expect(getSubscriptionOwnerGuard('none', 'none').blocked).toBe(false);
    expect(getSubscriptionOwnerGuard('stripe', 'canceled').blocked).toBe(false);
  });

  it('provides management destinations without inventing one for unknown ownership', () => {
    expect(subscriptionManagementUrl('apple')).toBe('https://apps.apple.com/account/subscriptions');
    expect(subscriptionManagementUrl('google')).toBe(
      'https://play.google.com/store/account/subscriptions',
    );
    expect(subscriptionManagementUrl('unknown')).toBeNull();
    expect(subscriptionSourceLabel('manual')).toBe('your organization');
  });
});
