import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { isStripeCustomerId } from '@/lib/server/stripe-resource-ids';

export type BillingOwnerRow = Pick<
  SubscriptionRow,
  | 'plan_tier'
  | 'status'
  | 'stripe_customer_id'
  | 'stripe_subscription_id'
  | 'apple_original_transaction_id'
  | 'google_purchase_token'
  | 'current_period_end'
>;

const UNVERIFIED_MESSAGE =
  'Billing details could not be verified. Nothing was changed; please try again.';

export async function readBillingOwnerRow(
  db: DatabaseAdapter,
  userId: string,
): Promise<BillingOwnerRow | null> {
  try {
    const rows = await db.query<BillingOwnerRow>(
      `select plan_tier, status, stripe_customer_id, stripe_subscription_id,
              apple_original_transaction_id, google_purchase_token, current_period_end
         from public.subscriptions
        where user_id = $1
        limit 1`,
      [userId],
    );
    return rows[0] ?? null;
  } catch (error) {
    logger.error({ error, userId }, 'Billing account lookup failed');
    throw createError.serviceUnavailable(UNVERIFIED_MESSAGE).asUserSafe();
  }
}

export async function resolveBillingCustomerId(
  db: DatabaseAdapter,
  userId: string,
  row: BillingOwnerRow | null,
): Promise<string | null> {
  const subscriptionCustomerId = row?.stripe_customer_id;
  if (isStripeCustomerId(subscriptionCustomerId)) return subscriptionCustomerId;
  try {
    const rows = await db.query<{ stripe_customer_id: string | null }>(
      'select stripe_customer_id from public.profiles where id = $1 limit 1',
      [userId],
    );
    const profileCustomerId = rows[0]?.stripe_customer_id;
    return isStripeCustomerId(profileCustomerId) ? profileCustomerId : null;
  } catch (error) {
    logger.error({ error, userId }, 'Billing customer lookup failed');
    throw createError.serviceUnavailable(UNVERIFIED_MESSAGE).asUserSafe();
  }
}
