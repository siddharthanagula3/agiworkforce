import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { adminPermissionLevel } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  MAX_WORKSPACE_GROUP_NAME_CHARS,
  createWorkspaceGroup,
  listDirectoryGroupsWithRoles,
} from '@/lib/services/organization-role-service';
import {
  requireWorkspaceConsolePermission,
  resolveWorkspaceConsoleAccess,
} from '../workspace-access';

const CreateGroupSchema = z
  .object({ name: z.string().trim().min(1).max(MAX_WORKSPACE_GROUP_NAME_CHARS) })
  .strict();

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

async function handleCreate(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'groups.manage',
    'Your workspace role does not allow creating groups.',
  );
  const { name } = await readValidatedJsonBody(request, CreateGroupSchema, 'Invalid group');
  const group = await createWorkspaceGroup(getNeonDb(), {
    organizationId,
    name,
    actorUserId: userId,
  });

  await recordAuditEvent({
    userId,
    eventType: 'workspace_group_changed',
    organizationId,
    request,
    severity: 'info',
    detail: {
      resourceType: 'workspace_group',
      resourceId: group.id,
      status: 'created',
      role: access.role,
    },
  });

  return NextResponse.json({ groupId: group.id }, { status: 201 });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handleCreate);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
