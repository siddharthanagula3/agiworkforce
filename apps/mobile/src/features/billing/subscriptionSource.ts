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

function isWebBilledSource(source: MobileBillingSource): boolean {
  return source === 'stripe' || source === 'manual';
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
  webBillingLinksAllowed: boolean,
): SubscriptionOwnerGuard {
  const entitled = isEntitledSubscriptionStatus(status);
  const hasRecoverableRecordedOwner =
    source !== 'none' && !TERMINAL_SUBSCRIPTION_STATUSES.has(status.trim().toLowerCase());
  const managementUrl =
    isWebBilledSource(source) && !webBillingLinksAllowed ? null : subscriptionManagementUrl(source);

  return {
    blocked: entitled || hasRecoverableRecordedOwner,
    sourceLabel: subscriptionSourceLabel(source),
    managementUrl,
    managementActionLabel: !managementUrl
      ? 'OK'
      : isWebBilledSource(source)
        ? 'Manage on web'
        : 'Open subscriptions',
  };
}

export type BillingManagementTarget =
  { kind: 'portal' } | { kind: 'external'; url: string; label: string } | null;

/**
 * Where "Manage billing" actually goes. A store-billed subscription can only be
 * changed in the store that owns it, and the hosted portal exists only for a
 * web-billed account on a build that ships it. Anything else has no destination,
 * and the row is not drawn rather than opening something that cannot help. Web
 * billing is also undrawn wherever the store forbids linking to it.
 */
export function billingManagementTarget(input: {
  source: MobileBillingSource;
  portalEnabled: boolean;
  webBillingLinksAllowed: boolean;
}): BillingManagementTarget {
  const { source, portalEnabled, webBillingLinksAllowed } = input;
  if (isWebBilledSource(source) && !webBillingLinksAllowed) return null;
  if (isWebBilledSource(source) && portalEnabled) return { kind: 'portal' };

  const url = subscriptionManagementUrl(source);
  if (!url) return null;
  return {
    kind: 'external',
    url,
    label: isWebBilledSource(source)
      ? 'Manage billing on the web'
      : `Manage in ${subscriptionSourceLabel(source)}`,
  };
}
