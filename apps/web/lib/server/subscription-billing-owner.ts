import 'server-only';

import type { MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';

export type SubscriptionBillingSource = MeSubscriptionSource | 'unverified';

interface SubscriptionBillingOwnerRow {
  plan_tier: string;
  status: string;
  /**
   * Present on any row Stripe has ever billed, and written at checkout — well
   * before `checkout.session.completed` delivers the subscription id. It is what
   * separates "Stripe bills this, we just have not recorded which subscription
   * yet" from "an administrator provisioned this outside Stripe".
   */
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

/** Store renewal delivery may lag the paid-through timestamp. */
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

/**
 * Resolve the one billing owner from the canonical subscription row.
 *
 * The three provider identifiers are mutually exclusive by product contract,
 * but the database's individual UNIQUE constraints do not enforce that
 * relationship. Multiple identifiers, or a malformed Stripe subscription id,
 * therefore fail closed as `unverified` instead of guessing which provider is
 * still collecting payment.
 */
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

  // A paid row with a Stripe CUSTOMER but no subscription id is Stripe-billed
  // with the id not yet recorded — a delayed `checkout.session.completed`, or a
  // legacy row written before the column existed. Falling through to 'manual'
  // here told those users "this subscription is managed by your organization"
  // and refused the upgrade with a 409, which is both false and unactionable.
  //
  // It also made the recovery in `resolveStripeSubscriptionForUpgrade`
  // unreachable: that function exists precisely to find the live subscription
  // by customer id, and the ownership gate rejected the request before it could
  // run. Classifying as 'stripe' lets the recovery do its job; when it finds no
  // owned live subscription the route still refuses, with the honest
  // `checkout_required` instead of an invented org policy.
  //
  // No authorization is widened by this: the recovery independently verifies
  // that the subscription belongs to this customer AND carries this user's id.
  if (isStripeCustomerId(subscription.stripe_customer_id)) return 'stripe';

  return 'manual';
}

export function isTerminalSubscriptionStatus(status: string): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.has(status.trim().toLowerCase());
}

/**
 * Preserve the existing legacy-store expiry rule used by SubscriptionService.
 * Native notification handlers write `expired` directly, but historical store
 * rows have no lifecycle feed and must age out from their paid-through date.
 */
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

/**
 * One server-side decision for every Stripe entry point.
 *
 * A terminal Apple/Google/manual entitlement may be replaced by a new web
 * checkout, but it can never enter Stripe's portal or prorated-upgrade path.
 * Unverified ownership stays blocked even after a terminal-looking status: the
 * server cannot safely prove that another provider stopped billing.
 */
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
