import {
  currentStoreSource,
  getIapSubscriptionGuard,
  subscriptionManagementUrl,
  subscriptionSourceLabel,
} from '@/src/features/billing/subscriptionSource';

describe('subscription source purchase guard', () => {
  it('allows the current store to manage its own entitled subscription', () => {
    expect(currentStoreSource('ios')).toBe('apple');
    expect(currentStoreSource('android')).toBe('google');
    expect(getIapSubscriptionGuard('apple', 'active', 'ios').blocked).toBe(false);
    expect(getIapSubscriptionGuard('google', 'trialing', 'android').blocked).toBe(false);
  });

  it('blocks cross-platform and unknown entitled subscriptions', () => {
    expect(getIapSubscriptionGuard('stripe', 'active', 'ios')).toMatchObject({
      blocked: true,
      sourceLabel: 'AGI Workforce on the web',
      managementUrl: 'https://agiworkforce.com/settings/billing',
      managementActionLabel: 'Manage on web',
    });
    expect(getIapSubscriptionGuard('google', 'active', 'ios').blocked).toBe(true);
    expect(getIapSubscriptionGuard('unknown', 'active', 'ios').blocked).toBe(true);
  });

  it('does not block when there is no entitled subscription', () => {
    expect(getIapSubscriptionGuard('none', 'none', 'ios').blocked).toBe(false);
    expect(getIapSubscriptionGuard('stripe', 'canceled', 'ios').blocked).toBe(false);
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
