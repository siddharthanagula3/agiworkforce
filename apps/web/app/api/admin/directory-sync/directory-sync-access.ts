import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { canUseBillingPlanCapability, type BillingPlanTier } from '@agiworkforce/types';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveEntitlementPlan } from '@/lib/server/scim/scim-auth';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';

/**
 * Admin access control for the directory-sync control plane.
 *
 * Two defects in the original route are fixed here.
 *
 * 1. NO ENTITLEMENT GATE. The route had none, so any org owner on any plan —
 *    including free — could register a directory sync connection. Directory
 *    sync is sold as an Enterprise control, so it is gated on
 *    `canUseBillingPlanCapability(plan, 'enterprise_controls')`, which fails
 *    closed on an unknown or missing tier.
 *
 * 2. FIRST-MEMBERSHIP-WINS. Org resolution was
 *    `... where user_id = $1 and role in ('owner','admin') limit 1` with no
 *    organization filter, so an admin of two organizations silently operated
 *    on whichever row Postgres returned first. That was harmless while the
 *    route only stored a directory id; it stops being harmless the moment a
 *    SCIM bearer token can be minted against the wrong tenant. The caller now
 *    names the organization, and an implicit resolution is only accepted when
 *    it is unambiguous (exactly one administered organization).
 */

export type DirectorySyncAccessFailure = { response: NextResponse };

export interface DirectorySyncAccess {
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin';
  plan: BillingPlanTier;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(status: number, error: string, extra?: Record<string, unknown>) {
  return { response: NextResponse.json({ error, ...extra }, { status }) };
}

function isFailure(
  value: DirectorySyncAccess | DirectorySyncAccessFailure,
): value is DirectorySyncAccessFailure {
  return 'response' in value;
}

export { isFailure as isDirectorySyncAccessFailure };

/**
 * Resolve and authorize the caller.
 *
 * @param requestedOrganizationId - the organization the caller named, if any.
 *   Required whenever the caller administers more than one organization.
 */
export async function requireDirectorySyncAdmin(
  request: NextRequest,
  requestedOrganizationId: string | null,
): Promise<DirectorySyncAccess | DirectorySyncAccessFailure> {
  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch {
    return failure(401, 'Unauthorized');
  }

  if (requestedOrganizationId !== null && !UUID_PATTERN.test(requestedOrganizationId)) {
    return failure(400, 'organizationId must be a UUID');
  }

  const db = getNeonDb();

  let memberships: Array<Pick<OrganizationMemberRow, 'organization_id' | 'role'>>;
  try {
    memberships = await db.query<Pick<OrganizationMemberRow, 'organization_id' | 'role'>>(
      `select organization_id, role
         from organization_members
        where user_id = $1 and role in ('owner', 'admin')
        order by joined_at asc`,
      [userId],
    );
  } catch {
    return failure(503, 'Database temporarily unavailable');
  }

  if (memberships.length === 0) {
    return failure(403, 'Organization owner or admin role is required');
  }

  let membership: Pick<OrganizationMemberRow, 'organization_id' | 'role'> | undefined;

  if (requestedOrganizationId !== null) {
    membership = memberships.find((row) => row.organization_id === requestedOrganizationId);
    if (!membership) {
      // Do not confirm the organization exists to someone who does not
      // administer it.
      return failure(403, 'Organization owner or admin role is required');
    }
  } else if (memberships.length === 1) {
    membership = memberships[0];
  } else {
    return failure(
      400,
      'organizationId is required: this account administers several organizations',
      {
        organizationIds: memberships.map((row) => row.organization_id),
      },
    );
  }

  if (!membership) {
    return failure(403, 'Organization owner or admin role is required');
  }

  const plan = await resolveEntitlementPlan(db, userId);

  if (!canUseBillingPlanCapability(plan, 'enterprise_controls')) {
    return failure(403, 'Directory sync requires an active Enterprise subscription', {
      code: 'SUBSCRIPTION_REQUIRED',
      currentPlan: plan,
      requiredPlans: ['enterprise'],
    });
  }

  return {
    userId,
    organizationId: membership.organization_id,
    role: membership.role as 'owner' | 'admin',
    plan,
  };
}
