import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  canUseBillingPlanCapability,
  isOrganizationAdminRole,
  type BillingPlanTier,
} from '@agiworkforce/types';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';
import {
  resolveOrganizationEntitlementPlan,
  resolveUserPersonalPlanTier,
} from '@/lib/services/org-entitlements';

export interface SSOAdminAccess {
  plan: BillingPlanTier;
  canManageSSO: boolean;
}

export function canManageSSOOnPlan(plan: BillingPlanTier): boolean {
  return canUseBillingPlanCapability(plan, 'enterprise_controls');
}

async function administeredOrganizationPlans(
  db: DatabaseAdapter,
  userId: string,
): Promise<BillingPlanTier[]> {
  const memberships = await db.query<Pick<OrganizationMemberRow, 'organization_id' | 'role'>>(
    'select organization_id, role from organization_members where user_id = $1',
    [userId],
  );
  return Promise.all(
    memberships
      .filter((membership) => isOrganizationAdminRole(membership.role))
      .map((membership) => resolveOrganizationEntitlementPlan(membership.organization_id)),
  );
}

export async function getSSOAdminAccess(
  db: DatabaseAdapter,
  userId: string,
): Promise<SSOAdminAccess> {
  const plans = await administeredOrganizationPlans(db, userId);
  const plan =
    plans.find(canManageSSOOnPlan) ?? plans[0] ?? (await resolveUserPersonalPlanTier(db, userId));

  return { plan, canManageSSO: plans.some(canManageSSOOnPlan) };
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

export function ssoEntitlementDenial(plan: BillingPlanTier): SSOEntitlementDenial {
  return {
    status: 403,
    body: {
      error:
        'Enterprise SSO configuration requires an active Enterprise plan. Contact sales to scope an enterprise contract.',
      code: 'SUBSCRIPTION_REQUIRED',
      currentPlan: plan,
      requiredPlans: ['enterprise'] as const,
    },
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
  if (!access.canManageSSO) return { access, denial: ssoEntitlementDenial(access.plan) };
  return { access, denial: null };
}
