import { vi } from 'vitest';
import {
  BUILT_IN_ORGANIZATION_ROLES,
  type BuiltInOrganizationRoleKey,
  type OrganizationPermission,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';

export interface PermissionRoleHolder {
  value: string | null;
  grants?: readonly OrganizationPermission[];
}

export function permissionsForRole(
  role: string | null,
  grants: readonly OrganizationPermission[] = [],
): Set<OrganizationPermission> {
  const definition = role ? BUILT_IN_ORGANIZATION_ROLES[role as BuiltInOrganizationRoleKey] : null;
  return new Set([...(definition?.permissions ?? []), ...grants]);
}

export function organizationPermissionServiceMock(holder: PermissionRoleHolder) {
  const resolveOrganizationPermissions = vi.fn(async () =>
    permissionsForRole(holder.value, holder.grants),
  );
  return {
    resolveOrganizationPermissions,
    requireMemberPermission: vi.fn(
      async (
        _organizationId: string,
        _userId: string,
        permission: OrganizationPermission,
        deniedMessage: string,
      ) => {
        const permissions = permissionsForRole(holder.value, holder.grants);
        if (!permissions.has(permission)) {
          throw createError.forbidden(deniedMessage).asUserSafe();
        }
        return permissions;
      },
    ),
  };
}
