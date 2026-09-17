import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  GRANTABLE_ORGANIZATION_PERMISSIONS,
  PRIMARY_OWNER_ONLY_PERMISSIONS,
} from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  createCustomRole,
  listMemberRoleGrants,
  listOrganizationRoles,
} from '@/lib/services/organization-role-service';
import {
  requireWorkspaceConsolePermission,
  resolveWorkspaceConsoleAccess,
} from '../workspace-access';
import { CustomRoleSchema } from './role-schema';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId, access } = await resolveWorkspaceConsoleAccess(request);
  const db = getNeonDb();
  const canManageRoles = access.permissions.has('roles.manage');

  const [roles, memberRoleGrants] = await Promise.all([
    listOrganizationRoles(db, organizationId),
    canManageRoles ? listMemberRoleGrants(db, organizationId) : Promise.resolve({}),
  ]);

  return NextResponse.json({
    organizationId,
    currentUserId: userId,
    currentUserRole: access.role,
    currentUserPermissions: [...access.permissions].sort(),
    canManageRoles,
    canManageGroups: access.permissions.has('groups.manage'),
    grantablePermissions: GRANTABLE_ORGANIZATION_PERMISSIONS,
    primaryOwnerOnlyPermissions: PRIMARY_OWNER_ONLY_PERMISSIONS,
    roles,
    memberRoleGrants,
  });
}

async function handleCreate(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'roles.manage',
    'Your workspace role does not allow managing roles.',
  );
  const input = await readValidatedJsonBody(request, CustomRoleSchema, 'Invalid role');

  const role = await createCustomRole(getNeonDb(), {
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
      status: 'created',
      scopes: role.permissions,
      role: access.role,
    },
  });

  return NextResponse.json({ role }, { status: 201 });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handleCreate);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
