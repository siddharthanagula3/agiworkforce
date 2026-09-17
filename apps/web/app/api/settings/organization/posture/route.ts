import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { logAdminDataAccess } from '@/lib/server/admin-data-access';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import {
  readWorkspacePosture,
  type WorkspacePosture,
} from '@/lib/services/workspace-posture-service';

export const runtime = 'nodejs';

export interface WorkspacePostureResponse {
  currentUserRole: 'owner' | 'admin' | 'member' | 'viewer';
  posture: WorkspacePosture;
}

/**
 * Admin-only. The posture enumerates a workspace's identity, provisioning, and
 * data configuration, which is reconnaissance for a member who should not be
 * administering it, so the role check is a real gate, not a UI hint.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  await requireMemberPermission(
    membership.organizationId,
    userId,
    'audit.read',
    'Your workspace role does not allow viewing the workspace security posture.',
  );

  const posture = await readWorkspacePosture(db, membership.organizationId);

  await logAdminDataAccess(request, {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    resourceType: 'workspace_posture',
  });
  const payload: WorkspacePostureResponse = {
    currentUserRole: membership.role,
    posture,
  };

  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
