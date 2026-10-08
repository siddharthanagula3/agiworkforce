import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DEFAULT_TEAM_SEAT_TYPE,
  normalizeBillingPlanTier,
  normalizeTeamSeatType,
  teamSeatPlanTier,
  teamSeatTypeOfPlan,
  type BillingPlanTier,
  type TeamSeatType,
} from '@agiworkforce/types';

export interface SeatAssignmentColumns {
  seat_type: string | null;
  premium_paid_through: string | Date | null;
  licensed_premium_seats: number | string | null;
  premium_seat_rank: number | string | null;
}

export const SEAT_ASSIGNMENT_COLUMNS_SQL = `
    membership.seat_type as seat_type,
    membership.premium_paid_through as premium_paid_through,
    organization.licensed_premium_seats as licensed_premium_seats,
    (
      select count(*)
        from public.organization_members premium_peer
       where premium_peer.organization_id = membership.organization_id
         and premium_peer.seat_type = 'premium'
         and premium_peer.status = 'active'
         and (
           coalesce(premium_peer.seat_type_changed_at, premium_peer.joined_at),
           premium_peer.user_id
         ) <= (
           coalesce(membership.seat_type_changed_at, membership.joined_at),
           membership.user_id
         )
    ) as premium_seat_rank`;

function toCount(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export type PaidPeriodEnd = string | Date | null | undefined;

function paidThroughCovers(paidThrough: string | Date | null, periodEnd: PaidPeriodEnd): boolean {
  if (!paidThrough || !periodEnd) return false;
  const until = new Date(paidThrough).getTime();
  return until > Date.now() && until <= new Date(periodEnd).getTime();
}

export function entitledSeatType(
  row: SeatAssignmentColumns,
  ownerPeriodEnd: PaidPeriodEnd,
): TeamSeatType {
  if (paidThroughCovers(row.premium_paid_through, ownerPeriodEnd)) return 'premium';
  if (normalizeTeamSeatType(row.seat_type) !== 'premium') return DEFAULT_TEAM_SEAT_TYPE;
  const rank = toCount(row.premium_seat_rank, Number.MAX_SAFE_INTEGER);
  return rank <= toCount(row.licensed_premium_seats, 0) ? 'premium' : DEFAULT_TEAM_SEAT_TYPE;
}

export function seatHolderPlanTier(
  planTier: string | null | undefined,
  row: SeatAssignmentColumns | null | undefined,
  ownerPeriodEnd: PaidPeriodEnd,
): BillingPlanTier {
  const tier = normalizeBillingPlanTier(planTier);
  if (teamSeatTypeOfPlan(tier) !== DEFAULT_TEAM_SEAT_TYPE || !row) return tier;
  return teamSeatPlanTier(entitledSeatType(row, ownerPeriodEnd));
}

const OWNER_SEAT_SQL = `
  select
    ${SEAT_ASSIGNMENT_COLUMNS_SQL}
  from public.organization_members membership
  join public.organizations organization
    on organization.id = membership.organization_id
  where membership.user_id = $1
    and membership.status = 'active'
    and organization.owner_user_id = $1
    and (
      $2::text is null
      or organization.stripe_subscription_id is null
      or organization.stripe_subscription_id = $2::text
    )
  order by (organization.stripe_subscription_id is not null) desc, organization.id asc
  limit 1`;

export async function resolveOwnerSeatPlanTier(
  db: DatabaseAdapter,
  ownerUserId: string,
  planTier: string | null | undefined,
  stripeSubscriptionId: string | null,
  ownerPeriodEnd: PaidPeriodEnd,
): Promise<BillingPlanTier> {
  const tier = normalizeBillingPlanTier(planTier);
  if (teamSeatTypeOfPlan(tier) !== DEFAULT_TEAM_SEAT_TYPE) return tier;
  const [row] = await db.query<SeatAssignmentColumns>(OWNER_SEAT_SQL, [
    ownerUserId,
    stripeSubscriptionId,
  ]);
  return seatHolderPlanTier(tier, row, ownerPeriodEnd);
}
