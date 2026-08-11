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

/**
 * Organization-derived entitlement for organization-owned capabilities.
 *
 * HONEST SCOPE — read this before reusing it anywhere else.
 *
 * Personal capabilities resolve from the caller's own subscription. An
 * organization capability must instead resolve through the billing anchor on
 * the organization row introduced by migration 0085. When Stripe has not bound
 * that anchor yet, the organization owner is the fail-closed legacy anchor; an
 * admin's unrelated personal subscription is never consulted.
 *
 * This is deliberately a small, read-only derivation over data that already
 * exists. It is NOT a second entitlement resolver and it must not grow into
 * one:
 *   - it never grants personal capabilities (a member's personal limits are
 *     still read from their own plan, unchanged);
 *   - it gates Team administration and caps the org's shared set;
 *   - it is not used by chat, billing, or usage metering.
 *
 * The subscription status is re-evaluated on every read. Persisted seat counts
 * and `billing_plan_tier` are useful billing state, but neither can turn a dead
 * subscription into an active entitlement.
 */
export interface OrganizationEntitlements {
  organizationId: string;
  /** The plan the ORGANIZATION is entitled to through its billing anchor. */
  plan: BillingPlanTier;
  /** Max shared projects org-wide. `null` means uncapped, `0` means none. */
  sharedProjectLimit: number | null;
  /** Max shared connectors org-wide. `null` means uncapped, `0` means none. */
  sharedConnectorLimit: number | null;
}

/*
 * Limit conversion is deliberately NOT redeclared here.
 *
 * A local copy used to read:
 *
 *   if (limit === 'unlimited') return null;
 *   return typeof limit === 'number' ? limit : 0;
 *
 * which has no 'custom' arm, so every Enterprise limit — `projects`,
 * `customMcpServers`, all declared 'custom' in the catalog — fell through to 0.
 * `shareProject` and `shareConnector` both refuse outright at `=== 0`, so the
 * only tier that negotiates its limits was the only tier that could not share a
 * single project or connector.
 *
 * This is the second copy of that same defect. The first was fixed in
 * `free-plan-entitlements.ts` and pinned by a regression test, and this one
 * survived because the fix went to a copy rather than to the owner. Import the
 * canonical converter instead of writing a third.
 */

/**
 * Resolve the organization's active plan from its 0085 billing anchor.
 *
 * Current callers provide the privileged control-plane adapter because
 * `subscriptions` is under 0037's user-scoped RLS policy. The direct Stripe
 * anchor wins whenever present; only an unbound organization falls back to its
 * derived owner. Both fallback shapes refuse a billing identity already
 * claimed by another organization. The statement is always scoped to exactly
 * one organization, then the canonical SubscriptionService derives any
 * store-expiry status before capability checks consume it.
 */
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
    // The org's shared set is capped by the same product dimensions the plan
    // already declares. Team is projects 25 / customMcpServers 25.
    sharedProjectLimit: toEnforceableBillingPlanLimit(limits?.projects),
    sharedConnectorLimit: toEnforceableBillingPlanLimit(limits?.customMcpServers),
  };
}

/** Mirror of `isUserResourceLimitError` for `assert_org_resource_limit` (0086). */
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
