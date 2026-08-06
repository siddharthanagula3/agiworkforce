import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  listSharedConnectors,
  type SharedConnectorSummary,
} from '@/lib/services/org-shared-connector-service';
import {
  listSharedProjects,
  requireOrgMember,
  resolveOrgMembership,
  isOrgAdminRole,
  type SharedProjectSummary,
} from '@/lib/services/org-sharing-service';

/**
 * GET /api/settings/organization/shared
 *
 * The org-level view of what the organization shares and who can see it:
 * shared projects (with the per-member overrides that decide visibility),
 * shared connectors, and the member roster the admin grants against.
 *
 * TENANCY. The organization is resolved from `organization_members` for the
 * AUTHENTICATED subject — there is no organization id on the wire, so there is
 * nothing for a caller to tamper with. Every statement then binds that
 * server-derived id.
 *
 * This route runs on `getUserScopedDb()`, the non-BYPASSRLS `app_rls`
 * connection, so migration 0086's policies are a real second fence rather than
 * decoration: `organization_shared_projects` / `organization_shared_connectors`
 * are readable only through `app_org_resource_is_readable(organization_id)`,
 * which resolves membership inside the database. Deleting the `where
 * organization_id = $1` predicate from the service would still return nothing
 * for a foreign org.
 *
 * Members and viewers may READ this view — knowing what your organization
 * shares with you is the point of a shared surface. `canManageSharing` tells
 * the client whether to render the mutation controls; the mutation routes
 * re-check it server-side and the DB re-checks it again in WITH CHECK.
 */

export const runtime = 'nodejs';

interface OrgMemberRosterEntry {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
}

export interface OrganizationSharedOverview {
  organizationId: string;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  canManageSharing: boolean;
  members: OrgMemberRosterEntry[];
  sharedProjects: SharedProjectSummary[];
  sharedConnectors: SharedConnectorSummary[];
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));

  const [members, sharedProjects, sharedConnectors] = await Promise.all([
    db.query<{ user_id: string; role: OrgMemberRosterEntry['role']; joined_at: string }>(
      `select user_id, role, joined_at
         from public.organization_members
        where organization_id = $1
        order by joined_at asc`,
      [membership.organizationId],
    ),
    listSharedProjects(db, membership.organizationId),
    listSharedConnectors(db, membership.organizationId),
  ]);

  const payload: OrganizationSharedOverview = {
    organizationId: membership.organizationId,
    currentUserRole: membership.role,
    canManageSharing: isOrgAdminRole(membership.role),
    members: members.map((row) => ({
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
    })),
    sharedProjects,
    sharedConnectors,
  };

  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
