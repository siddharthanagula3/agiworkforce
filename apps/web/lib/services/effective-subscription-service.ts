import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { normalizeBillingPlanTier } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { getPlanUsageBudgetCents } from '@/lib/server/managed-usage-policy';
import { resolveManagedUsagePeriod } from '@/lib/server/managed-usage-period';
import { CreditService } from '@/lib/services/credit-service';
import { isSeatBearingBillingPlan } from '@/lib/services/entitlement-resolution';

// Entitlement itself resolves in `entitlement-resolution.ts`, the single entry
// point. This module keeps the seat ledger sweep and re-exports that surface so
// existing callers reach the same resolver.
export {
  ensureSeatMemberCreditAccount,
  entitlementDenialReason,
  isSeatBearingBillingPlan,
  resolveEffectiveSubscription,
  resolveEntitledPlanTier,
  resolveEntitlementBundle,
  type EntitlementBundle,
  type EntitlementResolutionOptions,
  type EntitlementSource,
} from '@/lib/services/entitlement-resolution';

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
