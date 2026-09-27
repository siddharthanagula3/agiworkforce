import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { resolvePlanTier } from '@/lib/price-tier-mapping';
import {
  readBillingOwnerRow,
  resolveBillingCustomerId,
  type BillingOwnerRow,
} from '@/lib/server/billing-owner-row';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import {
  getSubscriptionBillingOwnerPolicy,
  stripeBillingOwnershipMessage,
} from '@/lib/server/subscription-billing-owner';

export interface StoredUpgradeSubscription {
  planTier: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export interface ResolvedUpgradeSubscription {
  subscription: Stripe.Subscription;
  recovered: boolean;
}

function isResourceMissing(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'resource_missing'
  );
}

function customerIdOf(subscription: Stripe.Subscription): string | null {
  return typeof subscription.customer === 'string'
    ? subscription.customer
    : (subscription.customer?.id ?? null);
}

function isOwnedCurrentPlanSubscription(
  subscription: Stripe.Subscription,
  stored: StoredUpgradeSubscription,
  userId: string,
  requireCurrentPlan: boolean,
): boolean {
  if (!['active', 'trialing'].includes(subscription.status)) return false;
  if (
    isStripeCustomerId(stored.stripeCustomerId) &&
    customerIdOf(subscription) !== stored.stripeCustomerId
  ) {
    return false;
  }

  const metadataUserId = subscription.metadata?.['user_id'];
  if (metadataUserId && metadataUserId !== userId) return false;

  if (!requireCurrentPlan) return true;
  const priceId = subscription.items.data[0]?.price.id;
  return resolvePlanTier(subscription.metadata, priceId) === stored.planTier;
}

export async function resolveStripeSubscriptionForUpgrade(
  stripe: Stripe,
  stored: StoredUpgradeSubscription,
  userId: string,
): Promise<ResolvedUpgradeSubscription | null> {
  if (isStripeSubscriptionId(stored.stripeSubscriptionId)) {
    try {
      const subscription = await stripe.subscriptions.retrieve(stored.stripeSubscriptionId, {
        expand: ['items.data.price'],
      });
      if (isOwnedCurrentPlanSubscription(subscription, stored, userId, false)) {
        return { subscription, recovered: false };
      }
      return null;
    } catch (error) {
      if (!isResourceMissing(error)) throw error;
    }
  }

  if (!isStripeCustomerId(stored.stripeCustomerId)) return null;

  const subscriptions = await stripe.subscriptions.list({
    customer: stored.stripeCustomerId,
    status: 'all',
    limit: 10,
    expand: ['data.items.data.price'],
  });
  const subscription = subscriptions.data.find((candidate) =>
    isOwnedCurrentPlanSubscription(candidate, stored, userId, true),
  );

  return subscription ? { subscription, recovered: true } : null;
}

export interface ManagedStripeSubscription {
  row: BillingOwnerRow;
  customerId: string;
  subscriptionId: string;
  subscription: Stripe.Subscription;
}

export async function requireManagedStripeSubscription(
  stripe: Stripe,
  db: DatabaseAdapter,
  userId: string,
): Promise<ManagedStripeSubscription> {
  const row = await readBillingOwnerRow(db, userId);
  const policy = getSubscriptionBillingOwnerPolicy(row);
  if (!row || policy.terminal) {
    throw createError.conflict('This account has no active paid plan to change.');
  }
  if (!policy.canApplyStripeUpgrade) {
    throw createError.conflict(stripeBillingOwnershipMessage(policy, 'upgrade'));
  }

  const customerId = await resolveBillingCustomerId(db, userId, row);
  let resolved: ResolvedUpgradeSubscription | null;
  try {
    resolved = await resolveStripeSubscriptionForUpgrade(
      stripe,
      {
        planTier: row.plan_tier,
        stripeCustomerId: customerId,
        stripeSubscriptionId: row.stripe_subscription_id,
      },
      userId,
    );
  } catch (error) {
    logger.error({ error, userId }, 'Stripe subscription lookup failed');
    throw createError
      .serviceUnavailable(
        'Your subscription could not be read from billing. Nothing was changed; please try again.',
      )
      .asUserSafe();
  }
  const subscriptionCustomerId = resolved ? customerIdOf(resolved.subscription) : null;
  if (!resolved || !subscriptionCustomerId) {
    throw createError.conflict(
      'Your subscription could not be found in billing. Refresh your account and try again.',
    );
  }

  return {
    row,
    customerId: subscriptionCustomerId,
    subscriptionId: resolved.subscription.id,
    subscription: resolved.subscription,
  };
}

export async function refreshManagedStripeSubscription(
  stripe: Stripe,
  managed: ManagedStripeSubscription,
): Promise<ManagedStripeSubscription> {
  const subscription = await stripe.subscriptions.retrieve(managed.subscriptionId, {
    expand: ['items.data.price'],
  });
  return { ...managed, subscription };
}

export interface UpgradePromotion {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
}

export type UpgradeDiscount = { discount: string } | { promotion_code: string };

const INVALID_PROMOTION = 'That promotion code is not valid.';

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function isLiveCoupon(
  coupon: string | Stripe.Coupon | Stripe.DeletedCoupon | null | undefined,
): coupon is Stripe.Coupon {
  return !!coupon && typeof coupon !== 'string' && coupon.deleted !== true;
}

export async function resolveUpgradePromotion(
  stripe: Stripe,
  code: string,
  customerId: string,
  nowMs = Date.now(),
): Promise<UpgradePromotion> {
  const page = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
    expand: ['data.promotion.coupon'],
  });
  const promotion = page.data[0];
  const coupon = promotion?.promotion.coupon;
  if (!promotion || !isLiveCoupon(coupon)) throw createError.validation(INVALID_PROMOTION);
  if (!coupon.valid) throw createError.validation('That promotion code has ended.');
  if (promotion.expires_at !== null && promotion.expires_at * 1000 <= nowMs) {
    throw createError.validation('That promotion code has expired.');
  }
  if (promotion.max_redemptions !== null && promotion.times_redeemed >= promotion.max_redemptions) {
    throw createError.validation('That promotion code has been fully redeemed.');
  }
  const restrictedTo = idOf(promotion.customer);
  if (restrictedTo && restrictedTo !== customerId) throw createError.validation(INVALID_PROMOTION);
  if (promotion.restrictions.first_time_transaction) {
    throw createError.validation('That promotion code is only for a first purchase.');
  }

  return {
    id: promotion.id,
    code: promotion.code,
    percentOff: coupon.percent_off,
    amountOffCents: coupon.amount_off,
    currency: coupon.currency,
    duration: coupon.duration,
    durationInMonths: coupon.duration_in_months,
  };
}

export function upgradeDiscounts(
  subscription: Stripe.Subscription,
  promotion: UpgradePromotion,
): UpgradeDiscount[] {
  return [
    ...subscription.discounts.flatMap<UpgradeDiscount>((discount) => {
      const id = idOf(discount);
      return id ? [{ discount: id }] : [];
    }),
    { promotion_code: promotion.id },
  ];
}

export function promotionDiscountCents(
  lines: readonly Stripe.InvoiceLineItem[],
  promotion: UpgradePromotion,
): number {
  return lines.reduce(
    (total, line) =>
      total +
      (line.discount_amounts ?? []).reduce((sum, entry) => {
        const promotionCode =
          typeof entry.discount === 'string' ? null : idOf(entry.discount.promotion_code);
        return promotionCode === promotion.id ? sum + entry.amount : sum;
      }, 0),
    0,
  );
}
