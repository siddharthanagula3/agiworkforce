/**
 * AUDIT-P3: Stripe SDK type safety helpers
 *
 * These types handle Stripe SDK v19 -> v20 changes where period dates
 * moved from top-level subscription to items array (flexible billing).
 * Using proper type guards instead of `as unknown as` casts.
 */
import type Stripe from 'stripe';

/**
 * Extended Stripe subscription type with period fields at top level
 * (standard billing - pre-flexible billing or non-flexible subscriptions)
 */
export interface StripeSubscriptionWithPeriod extends Stripe.Subscription {
  current_period_start?: number;
  current_period_end?: number;
}

/**
 * Subscription item with period fields (flexible billing - Stripe v20+)
 */
export interface StripeSubscriptionItemWithPeriod {
  current_period_start?: number;
  current_period_end?: number;
  price: { id: string };
}

/**
 * Type for accessing discounts property safely across Stripe SDK versions
 */
export interface SubscriptionWithDiscounts {
  discounts?: Array<{ coupon?: { id?: string } }>;
}

/**
 * Get period from subscription - handles both top-level and item-level periods
 * Returns null if period data is not available
 */
export function getSubscriptionPeriod(
  subscription: Stripe.Subscription,
): { start: number; end: number } | null {
  // Try top-level fields first (standard billing)
  const sub = subscription as unknown as StripeSubscriptionWithPeriod;
  if (typeof sub.current_period_start === 'number' && typeof sub.current_period_end === 'number') {
    return { start: sub.current_period_start, end: sub.current_period_end };
  }

  // Fallback to items array (flexible billing - Stripe v20+)
  const item = subscription.items?.data?.[0] as StripeSubscriptionItemWithPeriod | undefined;
  if (
    item &&
    typeof item.current_period_start === 'number' &&
    typeof item.current_period_end === 'number'
  ) {
    return { start: item.current_period_start, end: item.current_period_end };
  }

  return null;
}

/**
 * Get coupon ID from subscription discounts (v20 API: discount -> discounts)
 */
export function getSubscriptionCouponId(subscription: Stripe.Subscription): string | null {
  const sub = subscription as unknown as SubscriptionWithDiscounts;
  return sub.discounts?.[0]?.coupon?.id ?? null;
}
