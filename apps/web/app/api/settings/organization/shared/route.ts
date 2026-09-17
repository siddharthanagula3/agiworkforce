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
}

export interface OrganizationSharedOverview {
  organizationId: string;
  currentUserId: string;
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  canManageSharing: boolean;
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

  const [
    members,
    sharedProjects,
    sharedConnectors,
    sharedArtifacts,
    sharedConversations,
    permissions,
  ] = await Promise.all([
    db.query<{ user_id: string; role: OrgMemberRosterEntry['role']; joined_at: string }>(
      `select user_id, role, joined_at
         from public.organization_members
        where organization_id = $1
        order by joined_at asc`,
      [membership.organizationId],
    ),
    listSharedProjects(db, membership.organizationId),
    listSharedConnectors(db, membership.organizationId),
    listSharedArtifacts(db, membership.organizationId),
    listSharedSessions(db, membership.organizationId),
    resolveOrganizationPermissions(membership.organizationId, userId),
  ]);

  const payload: OrganizationSharedOverview = {
    organizationId: membership.organizationId,
    currentUserId: userId,
    currentUserRole: membership.role,
    canManageSharing: permissions.has('sharing.manage'),
    members: members.map((row) => ({
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
    })),
    sharedProjects,
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
