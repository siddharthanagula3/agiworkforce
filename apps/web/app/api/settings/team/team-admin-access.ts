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
  /**
   * Licensed seat ceiling for the organization in scope, or null when no
   * organization was named. Backed by `organizations.licensed_seats`
   * (0085_organization_seats_lifecycle.sql).
   */
  maxMembers: number | null;
  /** Seats held by active members plus pending invitations, or null. */
  seatsConsumed: number | null;
  /** maxMembers - seatsConsumed, floored at 0, or null. */
  seatsAvailable: number | null;
  /**
   * Where `maxMembers` came from.
   *
   * `unknown`       — no organization was named, so no seat state was read.
   * `unprovisioned` — the organization has no linked Stripe subscription, so
   *                   the number is the migration's floor. It enforces the
   *                   ceiling but cannot grow until billing writes it.
   * `billing`       — the number came from a linked subscription.
   */
  seatSource: 'billing' | 'unprovisioned' | 'unknown';
}

/**
 * Resolve the caller's Team-administration capability, and — when an
 * organization is named — that organization's real licensed seat state.
 *
 * The seat numbers are REPORTING only. The ceiling itself is a database CHECK
 * (`organizations_seats_within_license`); nothing here may be used as a
 * read-then-write gate, because two admins would both read the same free seat.
 */
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
    // SUBSCRIPTION_REQUIRED is already an explicitly safe recovery code in
    // the web error handler, but the shared legacy ErrorCode union has not
    // yet been reconciled with that wire contract.
    throw new AppError(
      'SUBSCRIPTION_REQUIRED' as ErrorCodeValue,
      'Team administration requires an active Team or Enterprise subscription.',
      403,
      { currentPlan: access.plan, requiredPlans: ['team', 'enterprise'] },
    );
  }

  return access;
}
