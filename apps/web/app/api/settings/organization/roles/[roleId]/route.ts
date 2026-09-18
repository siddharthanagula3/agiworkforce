import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { deleteCustomRole, updateCustomRole } from '@/lib/services/organization-role-service';
import { requireWorkspaceConsolePermission } from '../../workspace-access';
import { CustomRoleSchema } from '../role-schema';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ roleId: string }> };

async function parseRoleId(context: RouteContext): Promise<string> {
  const { roleId } = await context.params;
  if (!UUID_RE.test(roleId)) throw createError.validation('roleId must be a uuid');
  return roleId;
}

async function handleUpdate(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const roleId = await parseRoleId(context);
  const { db, userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'roles.manage',
    'Your workspace role does not allow managing roles.',
  );
  const input = await readValidatedJsonBody(request, CustomRoleSchema, 'Invalid role');

  const role = await updateCustomRole(db, {
    roleId,
    organizationId,
    name: input.name,
    description: input.description,
    permissions: input.permissions,
    actorUserId: userId,
    actorPermissions: access.permissions,
  });

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId,
    request,
    severity: 'warning',
    detail: {
      resourceType: 'organization_role',
      resourceId: role.id,
      resourceName: role.name,
      status: 'updated',
      scopes: role.permissions,
      role: access.role,
    },
  });

  return NextResponse.json({ role });
}

async function handleDelete(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const roleId = await parseRoleId(context);
  const { db, userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'roles.manage',
    'Your workspace role does not allow managing roles.',
  );

  await deleteCustomRole(db, {
    organizationId,
    roleId,
    actorPermissions: access.permissions,
  });

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId,
    request,
    severity: 'warning',
    detail: {
      resourceType: 'organization_role',
      resourceId: roleId,
      status: 'deleted',
      role: access.role,
    },
  });

  return NextResponse.json({ success: true });
}

export const PATCH = withErrorHandler(handleUpdate);
export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
