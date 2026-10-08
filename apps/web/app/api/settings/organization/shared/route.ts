import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  listSharedConnectors,
  type SharedConnectorSummary,
} from '@/lib/services/org-shared-connector-service';
import {
  listSharedArtifacts,
  type SharedArtifactSummary,
} from '@/lib/services/org-shared-artifact-service';
import {
  listSharedSessions,
  type SharedSessionSummary,
} from '@/lib/services/org-shared-session-service';
import {
  listSharedProjects,
  requireOrgMember,
  resolveOrgMembership,
  type SharedProjectSummary,
} from '@/lib/services/org-sharing-service';
import { resolveOrganizationPermissions } from '@/lib/services/organization-permission-service';

export const runtime = 'nodejs';

interface OrgMemberRosterEntry {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
  displayName: string | null;
  email: string | null;
  canEditProjects: boolean;
}

export interface OrganizationSharedOverview {
  organizationId: string;
  currentUserId: string;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  canManageSharing: boolean;
  canShareOwnProjects: boolean;
  members: OrgMemberRosterEntry[];
  sharedProjects: SharedProjectSummary[];
  sharedConnectors: SharedConnectorSummary[];
  sharedArtifacts: SharedArtifactSummary[];
  sharedConversations: SharedSessionSummary[];
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));

  const permissions = await resolveOrganizationPermissions(membership.organizationId, userId);
  const canManageSharing = permissions.has('sharing.manage');
  const [members, sharedProjects, sharedConnectors, sharedArtifacts, sharedConversations] =
    await Promise.all([
      getNeonDb().query<{
        user_id: string;
        role: OrgMemberRosterEntry['role'];
        joined_at: string;
        display_name: string | null;
        email: string | null;
        can_edit_projects: boolean | null;
      }>(
        `select om.user_id, om.role, om.joined_at, p.display_name, p.email,
                'content.share' = any (
                  public.organization_member_permissions(om.organization_id, om.user_id)
                ) as can_edit_projects
           from public.organization_members om
           left join public.profiles p on p.id = om.user_id
          where om.organization_id = $1
          order by om.joined_at asc`,
        [membership.organizationId],
      ),
      listSharedProjects(db, membership.organizationId),
      listSharedConnectors(db, membership.organizationId),
      listSharedArtifacts(db, membership.organizationId),
      listSharedSessions(db, membership.organizationId),
    ]);

  const payload: OrganizationSharedOverview = {
    organizationId: membership.organizationId,
    currentUserId: userId,
    currentUserRole: membership.role,
    canManageSharing,
    canShareOwnProjects: permissions.has('content.share'),
    members: members.map((row) => ({
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
      displayName: row.display_name,
      email: row.email,
      canEditProjects: row.can_edit_projects === true,
    })),
    sharedProjects: canManageSharing
      ? sharedProjects
      : sharedProjects.filter(
          (project) =>
            project.ownerUserId === userId ||
            (project.memberGrants.find((grant) => grant.userId === userId)?.access ??
              project.defaultAccess) !== 'none',
        ),
    sharedConnectors,
    sharedArtifacts,
    sharedConversations,
  };

  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
