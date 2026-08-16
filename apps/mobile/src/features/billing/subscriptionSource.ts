import type { MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { isEntitledSubscriptionStatus } from '@agiworkforce/types';
import { storeDisplayName, storeSubscriptionManagementUrl } from '@/src/features/release-state';

export type MobileBillingSource = MeSubscriptionSource | 'unknown';

export interface SubscriptionOwnerGuard {
  blocked: boolean;
  sourceLabel: string;
  managementUrl: string | null;
  managementActionLabel: string;
}

const UNATTRIBUTED_SOURCE_LABEL = 'another platform';

const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  'none',
  'canceled',
  'cancelled',
  'expired',
  'incomplete_expired',
]);

export function subscriptionSourceLabel(source: MobileBillingSource): string {
  switch (source) {
    case 'stripe':
      return 'AGI Workforce on the web';
    case 'apple':
      return storeDisplayName('apple') ?? UNATTRIBUTED_SOURCE_LABEL;
    case 'google':
      return storeDisplayName('google') ?? UNATTRIBUTED_SOURCE_LABEL;
    case 'manual':
      return 'your organization';
    case 'none':
      return 'this device';
    case 'unknown':
      return UNATTRIBUTED_SOURCE_LABEL;
  }
}

export function subscriptionManagementUrl(source: MobileBillingSource): string | null {
  switch (source) {
    case 'stripe':
    case 'manual':
      return 'https://agiworkforce.com/settings/billing';
    case 'apple':
      return storeSubscriptionManagementUrl('apple');
    case 'google':
      return storeSubscriptionManagementUrl('google');
    case 'none':
    case 'unknown':
      return null;
  }
}

export function getSubscriptionOwnerGuard(
  source: MobileBillingSource,
  status: string,
): SubscriptionOwnerGuard {
  const entitled = isEntitledSubscriptionStatus(status);
  const hasRecoverableRecordedOwner =
    source !== 'none' && !TERMINAL_SUBSCRIPTION_STATUSES.has(status.trim().toLowerCase());
  const managementUrl = subscriptionManagementUrl(source);

  return {
    blocked: entitled || hasRecoverableRecordedOwner,
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
