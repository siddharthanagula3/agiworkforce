import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isOrgAdminRole,
  requireOrgMember,
  resolveOrgMembership,
} from '@/lib/services/org-sharing-service';
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

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);

  if (!isOrgAdminRole(membership.role)) {
    throw createError.forbidden(
      'Only an organization owner or admin can view the workspace security posture.',
    );
  }

  const posture = await readWorkspacePosture(db, membership.organizationId);

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
