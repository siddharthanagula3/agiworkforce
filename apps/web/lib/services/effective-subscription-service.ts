import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  isContractPricedPlan,
  isEntitledSubscriptionStatusForTier,
  isPerSeatBillingPlan,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { getPlanUsageBudgetCents } from '@/lib/server/managed-usage-policy';
import { resolveManagedUsagePeriod } from '@/lib/server/managed-usage-period';
import { resolveEffectiveSubscriptionBillingStatus } from '@/lib/server/subscription-billing-owner';
import { CreditService } from '@/lib/services/credit-service';
import { readOrganizationCollectionState } from '@/lib/services/enterprise-collection-state';
import { SubscriptionService, type SubscriptionInfo } from '@/lib/services/subscription-service';

export function isSeatBearingBillingPlan(planTier: string | null | undefined): boolean {
  const tier = normalizeBillingPlanTier(planTier);
  return isPerSeatBillingPlan(tier) || isContractPricedPlan(tier);
}

interface SeatCandidateRow {
  organization_id: string;
  owner_user_id: string;
  billing_plan_tier: string | null;
  licensed_seats: number | string | null;
  seat_rank: number | string | null;
  subscription_id: string;
  status: string;
  current_period_start: string | Date;
  current_period_end: string | Date;
  cancel_at_period_end: boolean | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  apple_original_transaction_id: string | null;
  google_purchase_token: string | null;
}

// `public.subscriptions` and `public.organizations` force row-level security, so
// a caller-scoped connection can never see the owner's billing row. Seat
// entitlement is an organization-level fact about someone else's subscription:
// it resolves on the privileged connection, scoped explicitly by the membership
// predicate below, exactly as `resolveOrganizationEntitlementPlan` does.
const SEAT_CANDIDATES_SQL = `
  select
    organization.id as organization_id,
    organization.owner_user_id as owner_user_id,
    organization.billing_plan_tier as billing_plan_tier,
    organization.licensed_seats as licensed_seats,
    (
      select count(*)
        from public.organization_members peer
       where peer.organization_id = organization.id
         and (peer.joined_at, peer.user_id) <= (membership.joined_at, membership.user_id)
    ) as seat_rank,
    owner_subscription.id as subscription_id,
    owner_subscription.status as status,
    owner_subscription.current_period_start as current_period_start,
    owner_subscription.current_period_end as current_period_end,
    owner_subscription.cancel_at_period_end as cancel_at_period_end,
    owner_subscription.stripe_subscription_id as stripe_subscription_id,
    owner_subscription.stripe_price_id as stripe_price_id,
    owner_subscription.apple_original_transaction_id as apple_original_transaction_id,
    owner_subscription.google_purchase_token as google_purchase_token
  from public.organization_members membership
  join public.organizations organization
    on organization.id = membership.organization_id
  join public.subscriptions owner_subscription
    on owner_subscription.user_id = organization.owner_user_id
  where membership.user_id = $1
    and organization.owner_user_id is not null
    and organization.owner_user_id <> membership.user_id
  order by membership.joined_at asc, organization.id asc`;

const SEAT_MEMBERS_SQL = `
  select
    organization.id as organization_id,
    organization.billing_plan_tier as billing_plan_tier,
    membership.user_id as user_id
  from public.organizations organization
  join public.organization_members membership
    on membership.organization_id = organization.id
  where organization.owner_user_id = $1
    and membership.user_id <> $1
    and (
      select count(*)
        from public.organization_members peer
       where peer.organization_id = organization.id
         and (peer.joined_at, peer.user_id) <= (membership.joined_at, membership.user_id)
    ) <= organization.licensed_seats
    and not exists (
      select 1
        from public.subscriptions member_subscription
       where member_subscription.user_id = membership.user_id
    )`;

function toCount(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

async function isSeatEntitled(row: SeatCandidateRow, orgTier: string): Promise<boolean> {
  if (toCount(row.seat_rank, Number.MAX_SAFE_INTEGER) > toCount(row.licensed_seats, 0)) {
    return false;
  }
  const status = resolveEffectiveSubscriptionBillingStatus({
    plan_tier: orgTier,
    status: row.status,
    stripe_subscription_id: row.stripe_subscription_id,
    apple_original_transaction_id: row.apple_original_transaction_id,
    google_purchase_token: row.google_purchase_token,
    current_period_end: row.current_period_end,
  });
  const collectionReadOnly = isContractPricedPlan(orgTier)
    ? (await readOrganizationCollectionState(getNeonDb(), row.organization_id)).readOnly
    : false;
  return isEntitledSubscriptionStatusForTier(orgTier, status, collectionReadOnly);
}

async function resolveSeatSubscription(userId: string): Promise<SubscriptionInfo | null> {
  const rows = await getNeonDb().query<SeatCandidateRow>(SEAT_CANDIDATES_SQL, [userId]);

  for (const row of rows) {
    const orgTier = normalizeBillingPlanTier(row.billing_plan_tier);
    if (!isSeatBearingBillingPlan(orgTier)) continue;
    if (!(await isSeatEntitled(row, orgTier))) continue;

    return {
      id: row.subscription_id,
      user_id: userId,
      plan_tier: orgTier,
      status: resolveEffectiveSubscriptionBillingStatus({
        plan_tier: orgTier,
        status: row.status,
        stripe_subscription_id: row.stripe_subscription_id,
        apple_original_transaction_id: row.apple_original_transaction_id,
        google_purchase_token: row.google_purchase_token,
        current_period_end: row.current_period_end,
      }),
      current_period_start: new Date(row.current_period_start),
      current_period_end: new Date(row.current_period_end),
      cancel_at_period_end: row.cancel_at_period_end ?? false,
      stripe_subscription_id: row.stripe_subscription_id,
      stripe_price_id: row.stripe_price_id,
      seat_source: { organizationId: row.organization_id, ownerUserId: row.owner_user_id },
    };
  }

  return null;
}

export async function ensureSeatMemberCreditAccount(
  db: DatabaseAdapter,
  subscription: SubscriptionInfo,
): Promise<void> {
  if (!subscription.seat_source) return;
  const budgetCents = getPlanUsageBudgetCents(subscription.plan_tier, 'monthly');
  if (budgetCents <= 0) return;

  try {
    const period = resolveManagedUsagePeriod({
      subscriptionPeriodStart: subscription.current_period_start,
      subscriptionPeriodEnd: subscription.current_period_end,
    });
    await CreditService.getOrCreateAccount(
      subscription.user_id,
      subscription.id,
      period.periodStart,
      period.periodEnd,
      budgetCents,
      db,
    );
  } catch (error) {
    logger.error(
      {
        error,
        userId: subscription.user_id,
        organizationId: subscription.seat_source.organizationId,
        planTier: subscription.plan_tier,
      },
      'Seat member usage ledger could not be provisioned',
    );
  }
}

/**
 * Entitlement as the metering path must see it.
 *
 * A team member holds no `subscriptions` row of their own: accepting an
 * invitation writes `organization_members` and moves the organization's seat
 * counters, nothing more. Every caller that asked `getSubscription` for a plan
 * tier therefore saw null and metered a paid seat as free.
 *
 * Precedence, in order:
 *   1. the user's own subscription row, whatever tier it carries;
 *   2. otherwise the earliest-joined organization they are a member of that has
 *      a seat-bearing billing plan, an entitled owner subscription, and a seat
 *      for them within `licensed_seats`;
 *   3. otherwise null, which the callers already read as free.
 *
 * Stripe portal, checkout and account-deletion callers keep asking
 * `getSubscription`: those act on the row the user personally owns, and a seat
 * is not one.
 */
export async function resolveEffectiveSubscription(
  db: DatabaseAdapter,
  userId: string,
): Promise<SubscriptionInfo | null> {
  const own = await SubscriptionService.getSubscription(db, userId);
  if (own) return own;

  let seat: SubscriptionInfo | null = null;
  try {
    seat = await resolveSeatSubscription(userId);
  } catch (error) {
    logger.error({ error, userId }, 'Seat entitlement lookup failed; falling back to no seat');
    return null;
  }

  if (!seat) return null;
  await ensureSeatMemberCreditAccount(db, seat);
  return seat;
}

export interface SeatMemberLedgerProvisioning {
  ownerUserId: string;
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
}

export async function provisionSeatMemberCreditAccounts(
  db: DatabaseAdapter,
  input: SeatMemberLedgerProvisioning,
): Promise<number> {
  const rows = await db.query<{
    organization_id: string;
    billing_plan_tier: string | null;
    user_id: string;
  }>(SEAT_MEMBERS_SQL, [input.ownerUserId]);

  const period = resolveManagedUsagePeriod({
    subscriptionPeriodStart: input.periodStart,
    subscriptionPeriodEnd: input.periodEnd,
  });

  let provisioned = 0;
  for (const row of rows) {
    const orgTier = normalizeBillingPlanTier(row.billing_plan_tier);
    if (!isSeatBearingBillingPlan(orgTier)) continue;
    const budgetCents = getPlanUsageBudgetCents(orgTier, 'monthly');
    if (budgetCents <= 0) continue;

    try {
      await CreditService.getOrCreateAccount(
        row.user_id,
        input.subscriptionId,
        period.periodStart,
        period.periodEnd,
        budgetCents,
        db,
      );
      provisioned += 1;
    } catch (error) {
      logger.error(
        { error, userId: row.user_id, organizationId: row.organization_id, planTier: orgTier },
        'Seat member usage ledger could not be provisioned during the credit sweep',
      );
    }
  }

  return provisioned;
}
