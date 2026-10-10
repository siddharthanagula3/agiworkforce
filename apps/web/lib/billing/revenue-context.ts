import 'server-only';

import { isBillingCurrency, type RevenueContext } from '@agiworkforce/types';

import { getPricePointForPriceId } from '@/lib/pricing';

export interface SubscriptionRevenueSource {
  stripe_price_id?: string | null;
  apple_original_transaction_id?: string | null;
  google_purchase_token?: string | null;
}

/**
 * The channel and currency a subscription is paid through, read from the ids
 * the subscription row already holds. A store id names the store; a Stripe
 * price id names its currency through the configured price point. Anything
 * else is unknown, and an unknown subscriber is budgeted like a US web one.
 */
export function revenueContextOfSubscription(
  row: SubscriptionRevenueSource | null | undefined,
): RevenueContext | null {
  if (!row) return null;
  if (row.apple_original_transaction_id) return { channel: 'ios', currency: 'usd' };
  if (row.google_purchase_token) return { channel: 'android', currency: 'usd' };
  const point = row.stripe_price_id ? getPricePointForPriceId(row.stripe_price_id) : null;
  if (!point || !isBillingCurrency(point.currency)) return null;
  return { channel: 'web', currency: point.currency };
}
