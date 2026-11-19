import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  restoreStripeRenewalAfterAccountDeletion,
  stopStripeRenewalForAccountDeletion,
  type AccountDeletionRenewalStop,
} from '@/lib/server/payments/stripe-provider';
import { isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import { SubscriptionService } from '@/lib/services/subscription-service';

export type AccountDeletionPlanRenewal = 'restored' | 'not_restored';

async function recordStoredRenewal(
  db: DatabaseAdapter,
  userId: string,
  subscriptionId: string,
  cancelAtPeriodEnd: boolean,
  canceledAt: string | null,
): Promise<void> {
  try {
    await db.execute(
      `update public.subscriptions
          set cancel_at_period_end = $3, canceled_at = $4, updated_at = now()
        where user_id = $1 and stripe_subscription_id = $2`,
      [userId, subscriptionId, cancelAtPeriodEnd, canceledAt],
    );
  } catch (error) {
    logger.warn(
      { error, userId, subscriptionId },
      'Renewal changed in Stripe; the stored cancellation flag waits for the subscription webhook',
    );
  }
}

export async function stopPlanRenewalForAccountDeletion(
  db: DatabaseAdapter,
  userId: string,
  subscriptionId: string,
  scheduledFor: string,
): Promise<AccountDeletionRenewalStop> {
  const result = await stopStripeRenewalForAccountDeletion(subscriptionId, scheduledFor);
  if (result.outcome === 'stopped') {
    await recordStoredRenewal(db, userId, subscriptionId, true, result.canceledAt);
  }
  return result;
}

export async function reversePlanRenewalStop(
  db: DatabaseAdapter,
  userId: string,
  subscriptionId: string,
  scheduledFor: string,
): Promise<void> {
  try {
    if (
      (await restoreStripeRenewalAfterAccountDeletion(subscriptionId, scheduledFor)) !== 'restored'
    ) {
      return;
    }
  } catch (error) {
    logger.error(
      { error, userId, subscriptionId },
      'Deletion was not scheduled, and the renewal it turned off could not be turned back on',
    );
    return;
  }
  await recordStoredRenewal(db, userId, subscriptionId, false, null);
}

export async function restorePlanRenewalAfterDeletionUndo(
  db: DatabaseAdapter,
  userId: string,
  scheduledFor: string,
): Promise<AccountDeletionPlanRenewal | null> {
  let subscriptionId: string | null | undefined;
  try {
    subscriptionId = (await SubscriptionService.getSubscription(db, userId))
      ?.stripe_subscription_id;
  } catch (error) {
    logger.error(
      { error, userId },
      'Deletion was cancelled, but the plan could not be read to restore its renewal',
    );
    return 'not_restored';
  }
  if (!isStripeSubscriptionId(subscriptionId)) return null;
  try {
    if (
      (await restoreStripeRenewalAfterAccountDeletion(subscriptionId, scheduledFor)) !== 'restored'
    ) {
      return null;
    }
  } catch (error) {
    logger.error(
      { error, userId, subscriptionId },
      'Deletion was cancelled, but the renewal it turned off could not be turned back on',
    );
    return 'not_restored';
  }
  await recordStoredRenewal(db, userId, subscriptionId, false, null);
  return 'restored';
}
