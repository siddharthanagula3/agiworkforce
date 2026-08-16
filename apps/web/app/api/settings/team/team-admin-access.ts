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
    ? await resolveOrganizationEntitlementPlan(db, organizationId)
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

export async function requireTeamAdminAccess(
  db: DatabaseAdapter,
  userId: string,
  organizationId?: string | null,
): Promise<TeamAdminAccess> {
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
