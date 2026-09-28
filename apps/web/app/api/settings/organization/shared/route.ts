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
  listOrgMemberRoster,
  listSharedProjects,
  requireOrgMember,
  resolveOrgMembership,
  type OrgMemberRosterEntry,
  type SharedProjectSummary,
} from '@/lib/services/org-sharing-service';
import { resolveOrganizationPermissions } from '@/lib/services/organization-permission-service';

export const runtime = 'nodejs';

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
    listOrgMemberRoster(membership.organizationId),
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
    members,
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
