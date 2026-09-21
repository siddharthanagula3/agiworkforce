import 'server-only';

import { NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isFreeOfChargePlanTier } from '@agiworkforce/types';
import { getSubscriptionBillingOwnerPolicy } from '@/lib/server/subscription-billing-owner';

export const WAITLIST_ACCESS_REQUIRED_CODE = 'waitlist_access_required';

export const WAITLIST_ACCESS_REQUIRED_MESSAGE =
  'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.';

interface BillingHistoryRow {
  plan_tier: string;
  status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  apple_original_transaction_id?: string | null;
  google_purchase_token?: string | null;
  current_period_end?: string | Date | null;
}

export async function hasBillingWaitlistAccess(
  db: DatabaseAdapter,
  userId: string,
): Promise<boolean> {
  const [row] = await db.query<{ granted: boolean }>(
    `select exists(
       select 1 from beta_redemptions where user_id = $1
     ) as granted`,
    [userId],
  );
  return row?.granted === true;
}

export function waitlistAccessRequiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: WAITLIST_ACCESS_REQUIRED_CODE,
        message: WAITLIST_ACCESS_REQUIRED_MESSAGE,
      },
    },
    { status: 403 },
  );
}

function hasIdentifier(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function holdsLivePaidSubscription(
  subscription: BillingHistoryRow | null | undefined,
): boolean {
  if (!subscription || isFreeOfChargePlanTier(subscription.plan_tier)) return false;
  return !getSubscriptionBillingOwnerPolicy(subscription).terminal;
}

export function hasPaidBillingHistory(subscription: BillingHistoryRow | null | undefined): boolean {
  if (!subscription) return false;
  if (!isFreeOfChargePlanTier(subscription.plan_tier)) return true;
  return (
    hasIdentifier(subscription.stripe_subscription_id) ||
    hasIdentifier(subscription.apple_original_transaction_id) ||
    hasIdentifier(subscription.google_purchase_token)
  );
}
