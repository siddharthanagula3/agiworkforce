import type { OrganizationRole } from './index';

export const ORGANIZATION_PERMISSIONS = [
  'content.read',
  'content.share',
  'content.govern',
  'sharing.manage',
  'members.manage',
  'owners.manage',
  'roles.manage',
  'groups.manage',
  'policy.manage',
  'identity.read',
  'identity.manage',
  'directory.manage',
  'audit.read',
  'billing.read',
  'workspace.settings',
  'ownership.transfer',
  'workspace.delete',
  'billing.contracts.manage',
] as const;

export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

export const PRIMARY_OWNER_ONLY_PERMISSIONS: readonly OrganizationPermission[] = Object.freeze([
  'ownership.transfer',
  'workspace.delete',
  'billing.contracts.manage',
]);

export const GRANTABLE_ORGANIZATION_PERMISSIONS: readonly OrganizationPermission[] = Object.freeze(
  ORGANIZATION_PERMISSIONS.filter(
    (permission) => !PRIMARY_OWNER_ONLY_PERMISSIONS.includes(permission),
  ),
);

export const BUILT_IN_ORGANIZATION_ROLE_KEYS = [
  'primary_owner',
  'owner',
  'admin',
  'member',
  'viewer',
] as const;

export type BuiltInOrganizationRoleKey = (typeof BUILT_IN_ORGANIZATION_ROLE_KEYS)[number];

export interface BuiltInOrganizationRoleDefinition {
  key: BuiltInOrganizationRoleKey;
  name: string;
  description: string;
  assignable: boolean;
  permissions: readonly OrganizationPermission[];
}

const ADMIN_PERMISSIONS: readonly OrganizationPermission[] = [
  'content.read',
  'content.share',
  'content.govern',
  'sharing.manage',
  'members.manage',
  'roles.manage',
  'policy.manage',
  'identity.read',
  'directory.manage',
  'audit.read',
  'billing.read',
  'workspace.settings',
];

export const BUILT_IN_ORGANIZATION_ROLES: Readonly<
  Record<BuiltInOrganizationRoleKey, BuiltInOrganizationRoleDefinition>
> = Object.freeze({
  primary_owner: {
    key: 'primary_owner',
    name: 'Primary Owner',
    description:
      'The one person who can transfer ownership, delete the workspace and manage its billing contract.',
    assignable: false,
    permissions: [...ORGANIZATION_PERMISSIONS],
  },
  owner: {
    key: 'owner',
    name: 'Owner',
    description:
      'Everything an admin can do, plus single sign-on, directory group roles and other owners.',
    assignable: true,
    permissions: [...GRANTABLE_ORGANIZATION_PERMISSIONS],
  },
  admin: {
    key: 'admin',
    name: 'Admin',
    description: 'Manages members, roles, policy, directory sync and what is shared.',
    assignable: true,
    permissions: ADMIN_PERMISSIONS,
  },
  member: {
    key: 'member',
    name: 'Member',
    description: 'Opens what the workspace shares and shares their own work into it.',
    assignable: true,
    permissions: ['content.read', 'content.share'],
  },
  viewer: {
    key: 'viewer',
    name: 'Viewer',
    description:
      'Read-only: opens what the workspace shares, and cannot share, edit or change settings.',
    assignable: true,
    permissions: ['content.read'],
  },
});

export function builtInRoleKeyForMembershipRole(
  role: OrganizationRole,
): BuiltInOrganizationRoleKey {
  return role === 'owner' ? 'primary_owner' : role;
}

export function isOrganizationPermission(value: unknown): value is OrganizationPermission {
  return (
    typeof value === 'string' && (ORGANIZATION_PERMISSIONS as readonly string[]).includes(value)
  );
}

export function isGrantableOrganizationPermission(value: unknown): value is OrganizationPermission {
  return isOrganizationPermission(value) && !PRIMARY_OWNER_ONLY_PERMISSIONS.includes(value);
}

export function hasOrganizationPermission(
  granted: Iterable<string>,
  permission: OrganizationPermission,
): boolean {
  for (const entry of granted) {
    if (entry === permission) return true;
  }
  return false;
}

export function missingOrganizationPermissions(
  granted: Iterable<string>,
  required: Iterable<string>,
): string[] {
  const held = new Set(granted);
  return [...new Set(required)].filter((permission) => !held.has(permission)).sort();
}
