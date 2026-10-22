import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const PLAN_CHANGE_REFUSED_DURING_DELETION =
  'Cancel the account deletion to change your plan.';

export const TOP_UP_REFUSED_DURING_DELETION = 'Cancel the account deletion to buy credits.';

const PLAN_CHANGE_UNVERIFIED = 'Your account status could not be verified. Nothing was changed.';

export const PLAN_CHANGE_REFUSED_DURING_DISPUTE =
  'Your plan is on hold while a payment dispute is open.';

export type AccountBillingHold = 'deletion_scheduled' | 'dispute_open';

/**
 * A purchase while the account is scheduled for erasure, or while a chargeback
 * holds it, would take payment for something the account is about to lose.
 */
export async function readAccountBillingHold(
  db: DatabaseAdapter,
  userId: string,
): Promise<AccountBillingHold | null> {
  const [state] = await db.query<{ deletion_scheduled: boolean; dispute_open: boolean }>(
    `select exists (
              select 1 from public.profiles
               where id = $1 and deletion_scheduled_for is not null
            ) as deletion_scheduled,
            exists (
              select 1 from public.billing_disputes
               where user_id = $1 and outcome = 'open'
            ) as dispute_open`,
    [userId],
  );
  if (state?.deletion_scheduled) return 'deletion_scheduled';
  if (state?.dispute_open) return 'dispute_open';
  return null;
}

export async function assertPlanChangeAllowed(
  db: DatabaseAdapter,
  userId: string,
  purchase: 'plan' | 'credits' = 'plan',
): Promise<void> {
  let hold: AccountBillingHold | null;
  try {
    hold = await readAccountBillingHold(db, userId);
  } catch (error) {
    logger.error({ error, userId }, 'Purchase refused: account hold state could not be read');
    throw createError.serviceUnavailable(PLAN_CHANGE_UNVERIFIED).asUserSafe();
  }
  if (hold === 'deletion_scheduled') {
    throw createError
      .conflict(
        purchase === 'credits'
          ? TOP_UP_REFUSED_DURING_DELETION
          : PLAN_CHANGE_REFUSED_DURING_DELETION,
      )
      .asUserSafe();
  }
  if (hold === 'dispute_open') {
    throw createError.conflict(PLAN_CHANGE_REFUSED_DURING_DISPUTE).asUserSafe();
  }
}
