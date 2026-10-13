import 'server-only';

import { NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isFreeOfChargePlanTier } from '@agiworkforce/types';
import { readBillingUpgradesOpen } from '@/lib/feature-flags/billing-upgrade-gate';
import { getSubscriptionBillingOwnerPolicy } from '@/lib/server/subscription-billing-owner';

export const WAITLIST_ACCESS_REQUIRED_CODE = 'waitlist_access_required';

export const WAITLIST_ACCESS_REQUIRED_MESSAGE =
  'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.';

// Written on a beta_invites row that only opens the upgrade gate, so the trial
// offer route can tell it from an invite that grants a plan.
export const UPGRADE_ACCESS_INVITE_KIND = 'billing_upgrade_access';

interface BillingHistoryRow {
  plan_tier: string;
  status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  apple_original_transaction_id?: string | null;
  google_purchase_token?: string | null;
  current_period_end?: string | Date | null;
}

export function billingUpgradesForcedOpen(): boolean {
  return process.env['AGI_BILLING_WAITLIST_OPEN'] === '1';
}

/**
 * Paid upgrades open in stages behind an access code until the owner opens
 * them to everyone. The operator switch is a run-time flag, so opening or
 * closing takes effect without a deployment; AGI_BILLING_WAITLIST_OPEN=1
 * forces them open whatever the switch says.
 */
export async function billingUpgradesOpenFor(userId: string): Promise<boolean> {
  return billingUpgradesForcedOpen() || (await readBillingUpgradesOpen(userId));
}

export async function hasBillingWaitlistAccess(
  db: DatabaseAdapter,
  userId: string,
): Promise<boolean> {
  if (await billingUpgradesOpenFor(userId)) return true;
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
