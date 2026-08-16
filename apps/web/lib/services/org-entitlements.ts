import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  effectivePlanTier,
  getBillingPlanProductLimits,
  normalizeBillingPlanTier,
  toEnforceableBillingPlanLimit,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import { SubscriptionService } from '@/lib/services/subscription-service';

export interface OrganizationEntitlements {
  organizationId: string;
  plan: BillingPlanTier;
  sharedProjectLimit: number | null;
  sharedConnectorLimit: number | null;
}

export async function resolveOrganizationEntitlementPlan(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<BillingPlanTier> {
  const [billing] = await db.query<{
    user_id: string | null;
    plan_tier: string | null;
    status: string | null;
  }>(
    `select s.user_id, s.plan_tier, s.status
       from public.organizations o
       left join public.subscriptions s
         on (
           o.stripe_subscription_id is not null
           and s.stripe_subscription_id = o.stripe_subscription_id
         ) or (
           o.stripe_subscription_id is null
           and s.user_id = o.owner_user_id
           and (
             s.stripe_subscription_id is null
             or not exists (
               select 1
                 from public.organizations claimed
               where claimed.stripe_subscription_id = s.stripe_subscription_id
             )
           )
           and (
             s.stripe_subscription_id is not null
             or not exists (
               select 1
                 from public.organizations claimed_owner
                where claimed_owner.id <> o.id
                  and claimed_owner.stripe_subscription_id is null
                  and claimed_owner.owner_user_id = o.owner_user_id
             )
           )
         )
      where o.id = $1
      limit 1`,
    [organizationId],
  );

  if (!billing?.user_id) return normalizeBillingPlanTier('free');
  const subscription = await SubscriptionService.getSubscription(db, billing.user_id);
  return normalizeBillingPlanTier(effectivePlanTier(subscription?.plan_tier, subscription?.status));
}

export async function getOrganizationEntitlements(
  organizationId: string,
): Promise<OrganizationEntitlements> {
  const db: DatabaseAdapter = getNeonDb();
  const plan = await resolveOrganizationEntitlementPlan(db, organizationId);

  const limits = getBillingPlanProductLimits(plan);
  return {
    organizationId,
    plan,
    sharedProjectLimit: toEnforceableBillingPlanLimit(limits?.projects),
    sharedConnectorLimit: toEnforceableBillingPlanLimit(limits?.customMcpServers),
  };
}

export function isOrgResourceLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record['code'] === 'P0001' &&
    String(record['message'] ?? '').includes('org_resource_limit_reached')
  );
}

export function getSharedProjectLimitErrorMessage(limit: number | null): string {
  if (limit === null) return 'Your organization cannot share more projects right now.';
  if (limit === 0) {
    return 'Your organization’s plan does not include shared projects. Upgrade to share a project with your members.';
  }
  return `Your organization can share up to ${limit} ${limit === 1 ? 'project' : 'projects'}. Un-share one to share another.`;
}

export function getSharedConnectorLimitErrorMessage(limit: number | null): string {
  if (limit === null) return 'Your organization cannot share more connectors right now.';
  if (limit === 0) {
    return 'Your organization’s plan does not include shared connectors. Upgrade to share a connector with your members.';
  }
  return `Your organization can share up to ${limit} custom ${limit === 1 ? 'connector' : 'connectors'}. Un-share one to share another.`;
}
