import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  isDirectoryGroupManager,
  setDirectoryGroupRoles,
} from '@/lib/services/organization-role-service';
import { resolveWorkspaceConsoleAccess } from '../../../workspace-access';
import { RoleIdListSchema } from '../../../roles/role-schema';
import { isUuid } from '@/lib/uuid';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ groupId: string }> };

async function handleSetGroupRoles(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { groupId } = await context.params;
  if (!isUuid(groupId)) throw createError.validation('groupId must be a uuid');

  const { userId, organizationId, access } = await resolveWorkspaceConsoleAccess(request);
  const db = getNeonDb();
  const permitted =
    access.permissions.has('groups.manage') ||
    (await isDirectoryGroupManager(db, organizationId, groupId, userId));
  if (!permitted) {
    throw createError
      .forbidden('Only a workspace owner or a manager of this group can change its roles.')
      .asUserSafe();
  }

  const { roleIds } = await readValidatedJsonBody(request, RoleIdListSchema, 'Invalid roles');
  const change = await setDirectoryGroupRoles(db, {
    organizationId,
    groupId,
    roleIds,
    actorUserId: userId,
    actorPermissions: access.permissions,
  });

  if (change.added.length > 0 || change.removed.length > 0) {
    await recordAuditEvent({
      userId,
      eventType: 'scim_group_role_mapping_changed',
      organizationId,
      request,
      severity: 'warning',
      detail: {
        resourceType: 'scim_group',
        resourceId: groupId,
        scopes: roleIds,
        reason: `added ${change.added.length}, removed ${change.removed.length}`,
        role: access.role,
      },
    });
  }

  return NextResponse.json({ groupId, roleIds, ...change });
}

export const PUT = withErrorHandler(handleSetGroupRoles);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
