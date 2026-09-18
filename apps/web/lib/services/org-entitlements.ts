import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  getBillingPlanProductLimits,
  normalizeBillingPlanTier,
  toEnforceableBillingPlanLimit,
  type BillingPlanTier,
  type CapabilityDenialReason,
} from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveEntitlementBundle } from '@/lib/services/effective-subscription-service';

export interface OrganizationEntitlements {
  organizationId: string;
  plan: BillingPlanTier;
  sharedProjectLimit: number | null;
  sharedConnectorLimit: number | null;
}

/**
 * Resolves what a single user's OWN subscription entitles them to, on
 * whichever connection the caller passes.
 *
 * `resolveOrganizationEntitlementPlan` calls this for its owner-fallback
 * branch, and callers that need to know what a specific member would bring
 * to an organization (before that member holds any role in it, such as an
 * ownership-transfer candidate) call it directly with the same connection
 * they already hold, so the two paths cannot drift apart.
 *
 * It resolves through `resolveEntitlementBundle`, the single entitlement entry
 * point, with seats off: a seat in the very organization being asked about must
 * never be the thing that entitles its holder to own it.
 */
export async function resolveUserPersonalPlanTier(
  db: DatabaseAdapter,
  userId: string,
): Promise<BillingPlanTier> {
  const bundle = await resolveEntitlementBundle(db, userId, { includeSeats: false });
  return bundle.plan;
}

/**
 * Resolves what an ORGANIZATION is entitled to, on the privileged connection.
 *
 * It deliberately does not accept a caller-scoped adapter, because accepting
 * one is how this went wrong: entitlement resolves from the OWNER's
 * subscription row, `public.subscriptions` has RLS forced, and a scoped
 * connection only ever sees the caller's own row. Every administrator who was
 * not the owner therefore joined to NULL, resolved to `free`, and was told the
 * workspace had no subscription, on all ten organization routes, while the
 * workspace held a valid Enterprise plan.
 *
 * This is an organization-level fact, not the caller's own data, and callers
 * establish membership on the scoped connection before asking: both call sites
 * pass an organization id taken from the caller's own membership, and
 * `requireTeamAdminAccess` asserts membership first.
 *
 * A present anchor is not proof of a subscription. An organizations row can
 * hold a Stripe id that no subscriptions row carries any more, because the
 * owner resubscribed under a new id while the organization kept the old one.
 * Treating that as authoritative resolved the workspace to free and locked its
 * owner out of administration while their subscription was live, so the owner
 * branch also opens when the anchor joins to nothing. Status is still
 * re-evaluated on every read, so a dead subscription stays dead either way, and
 * the claim guards still stop one subscription entitling two organizations.
 */
export async function resolveOrganizationEntitlementPlan(
  organizationId: string,
): Promise<BillingPlanTier> {
  const db: DatabaseAdapter = getNeonDb();
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
           (
             o.stripe_subscription_id is null
             or not exists (
               select 1
                 from public.subscriptions anchored
                where anchored.stripe_subscription_id = o.stripe_subscription_id
             )
           )
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
  return resolveUserPersonalPlanTier(db, billing.user_id);
}

export async function getOrganizationEntitlements(
  organizationId: string,
): Promise<OrganizationEntitlements> {
  const plan = await resolveOrganizationEntitlementPlan(organizationId);

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

export interface OrganizationLimitDenial {
  reason: CapabilityDenialReason;
  message: string;
}

/**
 * A limit of zero is the plan not including the feature at all, which is an
 * upgrade; a limit already spent is a quota. They read the same to a caller
 * that only has the sentence.
 */
function limitDenialReason(limit: number | null): CapabilityDenialReason {
  if (limit === null) return 'entitlement_missing';
  return limit === 0 ? 'requires_upgrade' : 'quota_exceeded';
}

export function getSharedProjectLimitDenial(limit: number | null): OrganizationLimitDenial {
  if (limit === null) {
    return {
      reason: limitDenialReason(limit),
      message: 'Your organization cannot share more projects right now.',
    };
  }
  if (limit === 0) {
    return {
      reason: limitDenialReason(limit),
      message:
        'Your organization’s plan does not include shared projects. Upgrade to share a project with your members.',
    };
  }
  return {
    reason: limitDenialReason(limit),
    message: `Your organization can share up to ${limit} ${limit === 1 ? 'project' : 'projects'}. Un-share one to share another.`,
  };
}

export function getSharedConnectorLimitDenial(limit: number | null): OrganizationLimitDenial {
  if (limit === null) {
    return {
      reason: limitDenialReason(limit),
      message: 'Your organization cannot share more connectors right now.',
    };
  }
  if (limit === 0) {
    return {
      reason: limitDenialReason(limit),
      message:
        'Your organization’s plan does not include shared connectors. Upgrade to share a connector with your members.',
    };
  }
  return {
    reason: limitDenialReason(limit),
    message: `Your organization can share up to ${limit} custom ${limit === 1 ? 'connector' : 'connectors'}. Un-share one to share another.`,
  };
}

export function getSharedProjectLimitErrorMessage(limit: number | null): string {
  return getSharedProjectLimitDenial(limit).message;
}

export function getSharedConnectorLimitErrorMessage(limit: number | null): string {
  return getSharedConnectorLimitDenial(limit).message;
}
