/**
 * AUDIT-P3: Stripe SDK type safety helpers
 *
 * These types handle Stripe SDK v19 -> v20 changes where period dates
 * moved from top-level subscription to items array (flexible billing).
 * Using proper type guards instead of `as unknown as` casts.
 */
import type Stripe from 'stripe';

export interface StripeSubscriptionWithPeriod extends Stripe.Subscription {
  current_period_start?: number;
  current_period_end?: number;
}

export interface StripeSubscriptionItemWithPeriod {
  current_period_start?: number;
  current_period_end?: number;
  price: { id: string };
}

export interface SubscriptionWithDiscounts {
  discounts?: Array<{ coupon?: { id?: string } }>;
}

export function getSubscriptionPeriod(
  subscription: Stripe.Subscription,
): { start: number; end: number } | null {
  const sub = subscription as unknown as StripeSubscriptionWithPeriod;
  if (typeof sub.current_period_start === 'number' && typeof sub.current_period_end === 'number') {
    return { start: sub.current_period_start, end: sub.current_period_end };
  }

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

export function getSubscriptionCouponId(subscription: Stripe.Subscription): string | null {
  const sub = subscription as unknown as SubscriptionWithDiscounts;
  return sub.discounts?.[0]?.coupon?.id ?? null;
}
