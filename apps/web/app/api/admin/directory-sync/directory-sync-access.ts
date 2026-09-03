import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { canUseBillingPlanCapability, type BillingPlanTier } from '@agiworkforce/types';
import { getClerkAuthUser } from '@/lib/api-auth';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveEntitlementPlan } from '@/lib/server/scim/scim-auth';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';

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
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return { response: unauthorizedResponseFor(authError) };
    }
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
