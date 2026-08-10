/**
 * Where an existing subscription is owned, and where the user must go to change
 * it. Mobile sells nothing, so this module only ever *attributes* ownership.
 *
 * CRIT-007: `subscriptionSourceLabel` and `subscriptionManagementUrl` used to
 * hardcode "the Apple App Store" / "Google Play" and their store URLs. Both are
 * distribution claims, and AGI has no listing on either store — the alert on
 * Settings > Billing > Upgrade plan told the user they had purchased through a
 * store the app has never shipped on, and offered a store link to prove it.
 * `subscription_source` arrives from `/api/me`, so a server bug or a hostile
 * response was all it took to render that.
 *
 * Both facts now come from the release-state registry (`lib/releaseState.ts`),
 * which fails closed: while a store has no verified listing the label degrades
 * to the same neutral wording used for an unknown owner and no URL is offered.
 * The guard still BLOCKS the plan change either way — an unattributable owner
 * must never become a second purchase path.
 */
import type { MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { isEntitledSubscriptionStatus } from '@agiworkforce/types';
import { storeDisplayName, storeSubscriptionManagementUrl } from '@/lib/releaseState';

export type MobileBillingSource = MeSubscriptionSource | 'unknown';

export interface SubscriptionOwnerGuard {
  blocked: boolean;
  sourceLabel: string;
  managementUrl: string | null;
  managementActionLabel: string;
}

/**
 * Wording for an owner we cannot name. Used for `unknown`, and for a store the
 * release-state registry has not verified a listing for — naming a store we do
 * not ship on would be a distribution claim.
 */
const UNATTRIBUTED_SOURCE_LABEL = 'another platform';

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
