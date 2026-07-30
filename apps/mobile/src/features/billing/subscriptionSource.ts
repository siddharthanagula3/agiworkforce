import type { MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { isEntitledSubscriptionStatus } from '@agiworkforce/types';

export type MobileBillingSource = MeSubscriptionSource | 'unknown';
export type MobileStorePlatform = 'ios' | 'android';

export interface IapSubscriptionGuard {
  blocked: boolean;
  sourceLabel: string;
  managementUrl: string | null;
  managementActionLabel: string;
}

export function currentStoreSource(platform: MobileStorePlatform): MeSubscriptionSource {
  return platform === 'ios' ? 'apple' : 'google';
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
 * Fail closed when an entitled subscription is not owned by the current
 * device store. An unknown owner is blocked too: an offline/stale client must
 * not risk selling a second subscription merely because `/api/me` has not
 * refreshed yet.
 */
export function getIapSubscriptionGuard(
  source: MobileBillingSource,
  status: string,
  platform: MobileStorePlatform,
): IapSubscriptionGuard {
  const entitled = isEntitledSubscriptionStatus(status);
  const blocked = entitled && source !== currentStoreSource(platform);
  const managementUrl = subscriptionManagementUrl(source);

  return {
    blocked,
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
