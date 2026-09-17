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
import { invalidateActiveOrganizationCache } from '@/lib/server/request-context-cache';
import { setMemberRoles } from '@/lib/services/organization-role-service';
import { requireWorkspaceConsolePermission } from '../../../workspace-access';
import { RoleIdListSchema } from '../../../roles/role-schema';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ userId: string }> };

async function handleSetRoles(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId: rawTargetUserId } = await context.params;
  const targetUserId = decodeURIComponent(rawTargetUserId).trim();
  if (!targetUserId || targetUserId.length > 255) {
    throw createError.validation('userId is required');
  }

  const { userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'roles.manage',
    'Your workspace role does not allow assigning roles.',
  );
  const { roleIds } = await readValidatedJsonBody(request, RoleIdListSchema, 'Invalid roles');

  const change = await setMemberRoles(getNeonDb(), {
    organizationId,
    userId: targetUserId,
    roleIds,
    actorUserId: userId,
    actorPermissions: access.permissions,
  });

  await invalidateActiveOrganizationCache(targetUserId);

  if (change.added.length > 0 || change.removed.length > 0) {
    await recordAuditEvent({
      userId,
      eventType: 'member_role_changed',
      organizationId,
      request,
      severity: 'warning',
      detail: {
        resourceType: 'organization_member',
        resourceId: targetUserId,
        targetUserId,
        scopes: roleIds,
        reason: `added ${change.added.length}, removed ${change.removed.length}`,
        role: access.role,
      },
    });
  }

  return NextResponse.json({ userId: targetUserId, roleIds, ...change });
}

export const PUT = withErrorHandler(handleSetRoles);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
