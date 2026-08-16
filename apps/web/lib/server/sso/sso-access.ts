import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  canUseBillingPlanCapability,
  effectivePlanTier,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { SubscriptionService } from '@/lib/services/subscription-service';

export interface SSOAdminAccess {
  plan: BillingPlanTier;
  canManageSSO: boolean;
}

export async function getSSOAdminAccess(
  db: DatabaseAdapter,
  userId: string,
): Promise<SSOAdminAccess> {
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const plan = normalizeBillingPlanTier(
    effectivePlanTier(subscription?.plan_tier, subscription?.status),
  );

  return {
    plan,
    canManageSSO: canUseBillingPlanCapability(plan, 'enterprise_controls'),
  };
}

export interface SSOEntitlementDenial {
  status: 403;
  body: {
    error: string;
    code: 'SUBSCRIPTION_REQUIRED';
    currentPlan: BillingPlanTier;
    requiredPlans: readonly ['enterprise'];
  };
}

export async function requireSSOAdminAccess(
  db: DatabaseAdapter,
  userId: string,
): Promise<
  | { access: SSOAdminAccess; denial: null }
  | { access: SSOAdminAccess; denial: SSOEntitlementDenial }
> {
  const access = await getSSOAdminAccess(db, userId);

  if (!access.canManageSSO) {
    return {
      access,
      denial: {
        status: 403,
        body: {
          error:
            'Enterprise SSO configuration requires an active Enterprise plan. Contact sales to scope an enterprise contract.',
          code: 'SUBSCRIPTION_REQUIRED',
          currentPlan: access.plan,
          requiredPlans: ['enterprise'] as const,
        },
      },
    };
  }

  return { access, denial: null };
}
