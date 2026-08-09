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
 * Organization-derived entitlement, for the SHARED surface only.
 *
 * HONEST SCOPE — read this before reusing it anywhere else.
 *
 * Today every entitlement gate in the product resolves a plan from the CALLER's
 * own `subscriptions` row (`SubscriptionService.getSubscription(db, userId)`),
 * because `subscriptions` is unique-per-user with no organization link. That is
 * the right answer for a personal project or a personal connector, and it stays
 * the answer for both.
 *
 * It is the WRONG answer for an org-wide ceiling. "The org may share at most 25
 * connectors" is a property of what the ORGANIZATION bought, not of whichever
 * admin happens to be clicking. So the org's plan is derived here from the
 * organization's OWNER — the one member whose subscription is the org's billing
 * anchor today.
 *
 * This is deliberately a small, read-only derivation over data that already
 * exists. It is NOT a second entitlement resolver and it must not grow into
 * one:
 *   - it never grants a member anything (a member's personal limits are still
 *     read from their own plan, unchanged);
 *   - it only ever CAPS the org's shared set;
 *   - it is not used by chat, billing, or usage metering.
 *
 * DEPENDENCY: the org↔subscription link and true seat-derived entitlement are
 * owned by the seats/lifecycle builder (migration 0085). When
 * `organizations.stripe_subscription_id` / licensed seats land, this function
 * should read the org's own subscription row directly and the owner lookup
 * below should be deleted. Until then, an org whose owner is on a free personal
 * plan shares nothing — which fails closed, and is the correct posture.
 */
export interface OrganizationEntitlements {
  organizationId: string;
  /** The plan the ORGANIZATION is entitled to, derived from its owner. */
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
 * Resolve the organization's plan from its owner's subscription.
 *
 * Runs on the privileged control-plane connection on purpose: `subscriptions`
 * is under 0037's user-scoped RLS policy, so an admin reading the OWNER's row
 * over `app_rls` would correctly get nothing. Both statements below are bound
 * to a single organization id / user id, so the isolation gate's requirement
 * (a scope predicate on every privileged statement) is satisfied literally.
 */
export async function getOrganizationEntitlements(
  organizationId: string,
): Promise<OrganizationEntitlements> {
  const db: DatabaseAdapter = getNeonDb();

  const [owner] = await db.query<{ user_id: string }>(
    `select user_id
       from public.organization_members
      where organization_id = $1
        and role = 'owner'
      order by joined_at asc
      limit 1`,
    [organizationId],
  );

  let plan: BillingPlanTier = normalizeBillingPlanTier('free');
  if (owner?.user_id) {
    const subscription = await SubscriptionService.getSubscription(db, owner.user_id);
    plan = normalizeBillingPlanTier(
      effectivePlanTier(subscription?.plan_tier, subscription?.status),
    );
  }

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
