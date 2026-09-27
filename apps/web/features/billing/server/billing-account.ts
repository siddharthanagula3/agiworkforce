import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { isStripeCustomerId } from '@/lib/server/stripe-resource-ids';
import { resolveStripeSubscriptionForUpgrade } from '@/lib/server/stripe-upgrade-subscription';
import {
  getSubscriptionBillingOwnerPolicy,
  stripeBillingOwnershipMessage,
} from '@/lib/server/subscription-billing-owner';

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

export interface ManagedStripeSubscription {
  row: BillingOwnerRow;
  customerId: string;
  subscription: Stripe.Subscription;
}

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

function customerIdOf(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;
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
  let resolved: Awaited<ReturnType<typeof resolveStripeSubscriptionForUpgrade>>;
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
  if (!resolved) {
    throw createError.conflict(
      'Your subscription could not be found in billing. Refresh your account and try again.',
    );
  }

  return {
    row,
    customerId: customerIdOf(resolved.subscription),
    subscription: resolved.subscription,
  };
}
