import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { setDirectoryGroupManagers } from '@/lib/services/organization-role-service';
import { requireWorkspaceConsolePermission } from '../../../workspace-access';
import { isUuid } from '@/lib/uuid';

export const runtime = 'nodejs';

const ManagersSchema = z
  .object({ userIds: z.array(z.string().trim().min(1).max(255)).max(50) })
  .strict();

type RouteContext = { params: Promise<{ groupId: string }> };

async function handleSetManagers(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { groupId } = await context.params;
  if (!isUuid(groupId)) throw createError.validation('groupId must be a uuid');

  const { userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'groups.manage',
    'Only a workspace owner can delegate group management.',
  );
  const { userIds } = await readValidatedJsonBody(request, ManagersSchema, 'Invalid managers');

  const managers = await setDirectoryGroupManagers(getNeonDb(), {
    organizationId,
    groupId,
    userIds,
    actorUserId: userId,
  });

  await recordAuditEvent({
    userId,
    eventType: 'scim_group_role_mapping_changed',
    organizationId,
    request,
    severity: 'warning',
    detail: {
      resourceType: 'scim_group_managers',
      resourceId: groupId,
      count: managers.length,
      role: access.role,
    },
  });

  return NextResponse.json({ groupId, managerUserIds: managers });
}

export const PUT = withErrorHandler(handleSetManagers);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
