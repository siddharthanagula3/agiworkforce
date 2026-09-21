import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { adminPermissionLevel } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getNeonDb } from '@/lib/server/neon-db';
import { listDirectoryGroupsWithRoles } from '@/lib/services/organization-role-service';
import { resolveWorkspaceConsoleAccess } from '../workspace-access';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId, access } = await resolveWorkspaceConsoleAccess(request);
  const level = adminPermissionLevel(access.permissions, 'groups');
  const canManageGroups = level === 'manage';

  const groups = await listDirectoryGroupsWithRoles(
    getNeonDb(),
    organizationId,
    level === 'none' ? userId : undefined,
  );

  return NextResponse.json({ organizationId, canManageGroups, groups });
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
