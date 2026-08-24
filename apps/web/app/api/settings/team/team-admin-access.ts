import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  canUseBillingPlanCapability,
  effectivePlanTier,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { AppError, type ErrorCodeValue } from '@/lib/errors';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { getOrganizationSeatState } from '@/lib/services/organization-seat-service';
import { resolveOrganizationEntitlementPlan } from '@/lib/services/org-entitlements';

export interface TeamAdminAccess {
  plan: BillingPlanTier;
  canManageTeam: boolean;
  maxMembers: number | null;
  seatsConsumed: number | null;
  seatsAvailable: number | null;
  seatSource: 'billing' | 'unprovisioned' | 'unknown';
}

export async function getTeamAdminAccess(
  db: DatabaseAdapter,
  userId: string,
  organizationId?: string | null,
): Promise<TeamAdminAccess> {
  const plan = organizationId
    ? await resolveOrganizationEntitlementPlan(organizationId)
    : await (async () => {
        const subscription = await SubscriptionService.getSubscription(db, userId);
        return normalizeBillingPlanTier(
          effectivePlanTier(subscription?.plan_tier, subscription?.status),
        );
      })();

  const base: TeamAdminAccess = {
    plan,
    canManageTeam: canUseBillingPlanCapability(plan, 'team_admin'),
    maxMembers: null,
    seatsConsumed: null,
    seatsAvailable: null,
    seatSource: 'unknown',
  };

  if (!organizationId) return base;

  const seats = await getOrganizationSeatState(db, organizationId);
  if (!seats) return base;

  return {
    ...base,
    maxMembers: seats.licensedSeats,
    seatsConsumed: seats.seatsConsumed,
    seatsAvailable: seats.seatsAvailable,
    seatSource: seats.seatSource,
  };
}

async function assertOrganizationMember(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string,
): Promise<void> {
  const rows = await db.query<{ user_id: string }>(
    `select user_id
       from public.organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [organizationId, userId],
  );
  if (rows.length === 0) {
    throw new AppError(
      'FORBIDDEN' as ErrorCodeValue,
      'You are not a member of this organization',
      403,
    );
  }
}

export async function requireTeamAdminAccess(
  db: DatabaseAdapter,
  userId: string,
  organizationId?: string | null,
): Promise<TeamAdminAccess> {
  if (organizationId) await assertOrganizationMember(db, userId, organizationId);
  const access = await getTeamAdminAccess(db, userId, organizationId);

  if (!access.canManageTeam) {
    throw new AppError(
      'SUBSCRIPTION_REQUIRED' as ErrorCodeValue,
      'Team administration requires an active Team or Enterprise subscription.',
      403,
      { currentPlan: access.plan, requiredPlans: ['team', 'enterprise'] },
    );
  }

  return access;
}
