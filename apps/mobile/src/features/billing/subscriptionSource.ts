import type { MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { isEntitledSubscriptionStatus } from '@agiworkforce/types';

export type MobileBillingSource = MeSubscriptionSource | 'unknown';

export interface SubscriptionOwnerGuard {
  blocked: boolean;
  sourceLabel: string;
  managementUrl: string | null;
  managementActionLabel: string;
}

export function subscriptionSourceLabel(source: MobileBillingSource): string {
  switch (source) {
    case 'stripe':
      return 'AGI Workforce on the web';
    case 'apple':
      return 'the Apple App Store';
    case 'google':
      return 'Google Play';
    case 'manual':
      return 'your organization';
    case 'none':
      return 'this device';
    case 'unknown':
      return 'another platform';
  }
}

export function subscriptionManagementUrl(source: MobileBillingSource): string | null {
  switch (source) {
    case 'stripe':
    case 'manual':
      return 'https://agiworkforce.com/settings/billing';
    case 'apple':
      return 'https://apps.apple.com/account/subscriptions';
    case 'google':
      return 'https://play.google.com/store/account/subscriptions';
    case 'none':
    case 'unknown':
      return null;
  }
}

/**
 * Fail closed when a paid subscription already has an owner. Mobile does not
 * sell subscriptions, so every entitled plan must be managed at its recorded
 * source rather than presenting a second plan-change path.
 */
export function getSubscriptionOwnerGuard(
  source: MobileBillingSource,
  status: string,
): SubscriptionOwnerGuard {
  const entitled = isEntitledSubscriptionStatus(status);
  const managementUrl = subscriptionManagementUrl(source);

  return {
    blocked: entitled,
    sourceLabel: subscriptionSourceLabel(source),
    managementUrl,
    managementActionLabel:
      source === 'stripe' || source === 'manual'
        ? 'Manage on web'
        : managementUrl
          ? 'Open subscriptions'
          : 'OK',
  };
}
