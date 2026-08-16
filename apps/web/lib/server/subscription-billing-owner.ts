import 'server-only';

import type { MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';

export type SubscriptionBillingSource = MeSubscriptionSource | 'unverified';

interface SubscriptionBillingOwnerRow {
  plan_tier: string;
  status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  apple_original_transaction_id?: string | null;
  google_purchase_token?: string | null;
  current_period_end?: string | Date | null;
}

const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  'none',
  'canceled',
  'cancelled',
  'expired',
  'incomplete_expired',
]);

const STORE_RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export interface SubscriptionBillingOwnerPolicy {
  source: SubscriptionBillingSource;
  status: string;
  terminal: boolean;
  ownershipVerified: boolean;
  canOpenStripePortal: boolean;
  canApplyStripeUpgrade: boolean;
  canStartStripeCheckout: boolean;
}

function hasIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolveSubscriptionBillingSource(
  subscription: SubscriptionBillingOwnerRow | null | undefined,
): SubscriptionBillingSource {
  if (!subscription) return 'none';

  const hasRawStripeId = hasIdentifier(subscription.stripe_subscription_id);
  const hasStripeId = isStripeSubscriptionId(subscription.stripe_subscription_id);
  const hasAppleId = hasIdentifier(subscription.apple_original_transaction_id);
  const hasGoogleId = hasIdentifier(subscription.google_purchase_token);
  const ownerCount = Number(hasStripeId) + Number(hasAppleId) + Number(hasGoogleId);

  if ((hasRawStripeId && !hasStripeId) || ownerCount > 1) return 'unverified';
  if (hasStripeId) return 'stripe';
  if (hasAppleId) return 'apple';
  if (hasGoogleId) return 'google';
  if ((subscription.plan_tier || '').trim().toLowerCase() === 'free') return 'none';

  if (isStripeCustomerId(subscription.stripe_customer_id)) return 'stripe';

  return 'manual';
}

export function isTerminalSubscriptionStatus(status: string): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.has(status.trim().toLowerCase());
}

export function resolveEffectiveSubscriptionBillingStatus(
  subscription: SubscriptionBillingOwnerRow | null | undefined,
  now = Date.now(),
): string {
  const status = subscription?.status?.trim().toLowerCase() || 'none';
  if (!subscription || isTerminalSubscriptionStatus(status)) return status;

  const source = resolveSubscriptionBillingSource(subscription);
  const hasValidStripeOwner = isStripeSubscriptionId(subscription.stripe_subscription_id);
  const hasStoreIdentifier =
    hasIdentifier(subscription.apple_original_transaction_id) ||
    hasIdentifier(subscription.google_purchase_token);
  const legacyStoreCandidate =
    source === 'apple' ||
    source === 'google' ||
    (source === 'unverified' && !hasValidStripeOwner && hasStoreIdentifier);
  if (!legacyStoreCandidate) return status;

  const rawPeriodEnd = subscription.current_period_end;
  if (!rawPeriodEnd) return status;
  const periodEnd = rawPeriodEnd instanceof Date ? rawPeriodEnd : new Date(rawPeriodEnd);
  return Number.isFinite(periodEnd.getTime()) && periodEnd.getTime() + STORE_RENEWAL_GRACE_MS < now
    ? 'expired'
    : status;
}

export function getSubscriptionBillingOwnerPolicy(
  subscription: SubscriptionBillingOwnerRow | null | undefined,
  now = Date.now(),
): SubscriptionBillingOwnerPolicy {
  const source = resolveSubscriptionBillingSource(subscription);
  const status = resolveEffectiveSubscriptionBillingStatus(subscription, now);
  const terminal = source === 'none' || isTerminalSubscriptionStatus(status);
  const ownershipVerified = source !== 'unverified';

  return {
    source,
    status,
    terminal,
    ownershipVerified,
    canOpenStripePortal: !subscription || source === 'stripe',
    canApplyStripeUpgrade: source === 'stripe' && (status === 'active' || status === 'trialing'),
    canStartStripeCheckout: ownershipVerified && (!subscription || terminal),
  };
}

export function stripeBillingOwnershipMessage(
  policy: SubscriptionBillingOwnerPolicy,
  action: 'checkout' | 'portal' | 'upgrade',
): string {
  if (!policy.ownershipVerified) {
    return 'Billing ownership could not be verified. No billing change was started; refresh your account or contact support.';
  }

  if (policy.source === 'apple') {
    return policy.terminal && action === 'portal'
      ? 'This ended subscription was billed by Apple, so it has no Stripe billing portal. Start a new web subscription from Pricing.'
      : 'This subscription is billed by Apple. Manage or cancel it with Apple before starting web billing.';
  }
  if (policy.source === 'google') {
    return policy.terminal && action === 'portal'
      ? 'This ended subscription was billed by Google Play, so it has no Stripe billing portal. Start a new web subscription from Pricing.'
      : 'This subscription is billed by Google Play. Manage or cancel it there before starting web billing.';
  }
  if (policy.source === 'manual') {
    return policy.terminal && action === 'portal'
      ? 'This ended subscription was managed by your organization and has no Stripe billing portal. Start a new web subscription from Pricing.'
      : 'This subscription is managed by your organization. Contact an administrator before starting web billing.';
  }
  if (policy.source === 'stripe') {
    if (action === 'checkout') {
      return 'Use the in-app upgrade flow so payment proration and existing usage are carried safely.';
    }
    if (action === 'upgrade' && policy.status !== 'active' && policy.status !== 'trialing') {
      return 'Resolve the current billing status in the Stripe billing portal before changing plans.';
    }
    return 'This Stripe subscription is not eligible for that billing action.';
  }

  return 'No Stripe billing account is linked to this subscription.';
}
