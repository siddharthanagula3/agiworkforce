import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  canUseBillingPlanCapability,
  effectivePlanTier,
  normalizeBillingPlanTier,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { SubscriptionService } from '@/lib/services/subscription-service';

/**
 * Entitlement for enterprise SSO configuration.
 *
 * SSO is a managed-cloud enterprise control. It is gated on the shared
 * `enterprise_controls` capability rather than on a plan-string comparison or a
 * tier ordering, so a new tier cannot silently inherit it.
 */
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

/**
 * Resolve entitlement and, when it is absent, return the exact denial payload
 * the route should emit. Returning a value rather than throwing keeps every SSO
 * handler on a single explicit fail-closed branch.
 */
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
