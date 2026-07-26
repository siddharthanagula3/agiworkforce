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

export interface TeamAdminAccess {
  plan: BillingPlanTier;
  canManageTeam: boolean;
  /**
   * Licensed seat quantity is not persisted in the current billing schema.
   * Keep this unknown instead of presenting or enforcing a fictional limit.
   */
  maxMembers: null;
}

export async function getTeamAdminAccess(
  db: DatabaseAdapter,
  userId: string,
): Promise<TeamAdminAccess> {
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const plan = normalizeBillingPlanTier(
    effectivePlanTier(subscription?.plan_tier, subscription?.status),
  );

  return {
    plan,
    canManageTeam: canUseBillingPlanCapability(plan, 'team_admin'),
    maxMembers: null,
  };
}

export async function requireTeamAdminAccess(
  db: DatabaseAdapter,
  userId: string,
): Promise<TeamAdminAccess> {
  const access = await getTeamAdminAccess(db, userId);

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
