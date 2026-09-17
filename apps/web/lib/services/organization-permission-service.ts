import 'server-only';

import {
  isOrganizationPermission,
  type OrganizationPermission,
  type OrganizationRole,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

export interface OrganizationAccess {
  organizationId: string;
  role: OrganizationRole;
  permissions: ReadonlySet<OrganizationPermission>;
}

export async function resolveOrganizationPermissions(
  organizationId: string,
  userId: string,
): Promise<ReadonlySet<OrganizationPermission>> {
  const [row] = await getNeonDb().query<{ permissions: unknown }>(
    `select public.organization_member_permissions($1::uuid, $2) as permissions`,
    [organizationId, userId],
  );
  const permissions = Array.isArray(row?.permissions) ? row.permissions : [];
  return new Set(permissions.filter(isOrganizationPermission));
}

export async function requireMemberPermission(
  organizationId: string,
  userId: string,
  permission: OrganizationPermission,
  deniedMessage: string,
): Promise<ReadonlySet<OrganizationPermission>> {
  const permissions = await resolveOrganizationPermissions(organizationId, userId);
  if (!permissions.has(permission)) {
    throw createError.forbidden(deniedMessage).asUserSafe();
  }
  return permissions;
}

export async function resolveOrganizationAccess(
  organizationId: string,
  userId: string,
): Promise<OrganizationAccess | null> {
  const [membership] = await getNeonDb().query<{ role: OrganizationRole }>(
    `select role
       from public.organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [organizationId, userId],
  );
  if (!membership) return null;
  return {
    organizationId,
    role: membership.role,
    permissions: await resolveOrganizationPermissions(organizationId, userId),
  };
}

export async function resolveActiveOrganizationAccess(
  userId: string,
): Promise<OrganizationAccess | null> {
  const organizationId = await resolveActiveOrganizationId(getNeonDb(), userId);
  if (!organizationId) return null;
  return resolveOrganizationAccess(organizationId, userId);
}

export function requirePermission(
  access: OrganizationAccess | null,
  permission: OrganizationPermission,
  deniedMessage: string,
): OrganizationAccess {
  if (!access) {
    throw createError.forbidden('You are not a member of this workspace.').asUserSafe();
  }
  if (!access.permissions.has(permission)) {
    throw createError.forbidden(deniedMessage).asUserSafe();
  }
  return access;
}

export async function requireOrganizationPermission(
  userId: string,
  organizationId: string,
  permission: OrganizationPermission,
  deniedMessage: string,
): Promise<OrganizationAccess> {
  return requirePermission(
    await resolveOrganizationAccess(organizationId, userId),
    permission,
    deniedMessage,
  );
}

export const SHARE_INTO_WORKSPACE_DENIED_MESSAGE =
  'Your workspace role is read-only, so you cannot share into this workspace. Ask a workspace admin to change your role.';
