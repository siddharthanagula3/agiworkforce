import type { OrganizationRole } from './index';

export const ORGANIZATION_PERMISSION_LEVELS = ['none', 'view', 'manage'] as const;

export type OrganizationPermissionLevel = (typeof ORGANIZATION_PERMISSION_LEVELS)[number];

export const FEATURE_PERMISSION_AREAS = ['content', 'sharing'] as const;

export type FeaturePermissionArea = (typeof FEATURE_PERMISSION_AREAS)[number];

export const ADMIN_PERMISSION_AREAS = [
  'members',
  'owners',
  'roles',
  'groups',
  'policy',
  'identity',
  'directory',
  'audit',
  'billing',
  'workspace',
  'ownership',
  'lifecycle',
  'contracts',
] as const;

export type AdminPermissionArea = (typeof ADMIN_PERMISSION_AREAS)[number];

export const FEATURE_ORGANIZATION_PERMISSIONS = [
  'feature.content.view',
  'feature.content.share',
  'feature.content.govern',
  'feature.sharing.manage',
] as const;

export type FeatureOrganizationPermission = (typeof FEATURE_ORGANIZATION_PERMISSIONS)[number];

export type AdminOrganizationPermission =
  `admin.${AdminPermissionArea}.view` | `admin.${AdminPermissionArea}.manage`;

export const ADMIN_ORGANIZATION_PERMISSIONS: readonly AdminOrganizationPermission[] = Object.freeze(
  ADMIN_PERMISSION_AREAS.flatMap(
    (area) => [`admin.${area}.view`, `admin.${area}.manage`] as AdminOrganizationPermission[],
  ),
);

export type CanonicalOrganizationPermission =
  FeatureOrganizationPermission | AdminOrganizationPermission;

export const CANONICAL_ORGANIZATION_PERMISSIONS: readonly CanonicalOrganizationPermission[] =
  Object.freeze([...FEATURE_ORGANIZATION_PERMISSIONS, ...ADMIN_ORGANIZATION_PERMISSIONS]);

export type LegacyOrganizationPermission =
  | 'content.read'
  | 'content.share'
  | 'content.govern'
  | 'sharing.manage'
  | 'members.manage'
  | 'owners.manage'
  | 'roles.manage'
  | 'groups.manage'
  | 'policy.manage'
  | 'identity.read'
  | 'identity.manage'
  | 'directory.manage'
  | 'audit.read'
  | 'billing.read'
  | 'workspace.settings'
  | 'ownership.transfer'
  | 'workspace.delete'
  | 'billing.contracts.manage';

/**
 * The keys the grid shipped with, still stored on every existing role grant and
 * still named by the RLS policies of 0200. They resolve to the canonical key
 * below, and both forms travel together in a resolved permission set.
 */
export const LEGACY_ORGANIZATION_PERMISSION_ALIASES: Readonly<
  Record<LegacyOrganizationPermission, CanonicalOrganizationPermission>
> = Object.freeze({
  'content.read': 'feature.content.view',
  'content.share': 'feature.content.share',
  'content.govern': 'feature.content.govern',
  'sharing.manage': 'feature.sharing.manage',
  'members.manage': 'admin.members.manage',
  'owners.manage': 'admin.owners.manage',
  'roles.manage': 'admin.roles.manage',
  'groups.manage': 'admin.groups.manage',
  'policy.manage': 'admin.policy.manage',
  'identity.read': 'admin.identity.view',
  'identity.manage': 'admin.identity.manage',
  'directory.manage': 'admin.directory.manage',
  'audit.read': 'admin.audit.view',
  'billing.read': 'admin.billing.view',
  'workspace.settings': 'admin.workspace.manage',
  'ownership.transfer': 'admin.ownership.manage',
  'workspace.delete': 'admin.lifecycle.manage',
  'billing.contracts.manage': 'admin.contracts.manage',
});

export const LEGACY_ORGANIZATION_PERMISSIONS: readonly LegacyOrganizationPermission[] =
  Object.freeze(
    Object.keys(LEGACY_ORGANIZATION_PERMISSION_ALIASES) as LegacyOrganizationPermission[],
  );

const CANONICAL_TO_LEGACY: ReadonlyMap<string, LegacyOrganizationPermission> = new Map(
  LEGACY_ORGANIZATION_PERMISSIONS.map((legacy) => [
    LEGACY_ORGANIZATION_PERMISSION_ALIASES[legacy],
    legacy,
  ]),
);

export type OrganizationPermission = CanonicalOrganizationPermission | LegacyOrganizationPermission;

export const ORGANIZATION_PERMISSIONS: readonly OrganizationPermission[] = Object.freeze([
  ...CANONICAL_ORGANIZATION_PERMISSIONS,
  ...LEGACY_ORGANIZATION_PERMISSIONS,
]);

const PERMISSION_LOOKUP: ReadonlySet<string> = new Set(ORGANIZATION_PERMISSIONS);

export function canonicalOrganizationPermission(
  value: string,
): CanonicalOrganizationPermission | null {
  const alias = LEGACY_ORGANIZATION_PERMISSION_ALIASES[value as LegacyOrganizationPermission];
  if (alias) return alias;
  return (CANONICAL_ORGANIZATION_PERMISSIONS as readonly string[]).includes(value)
    ? (value as CanonicalOrganizationPermission)
    : null;
}

export function legacyOrganizationPermission(value: string): LegacyOrganizationPermission | null {
  return CANONICAL_TO_LEGACY.get(value) ?? null;
}

export function adminPermissionKey(
  area: AdminPermissionArea,
  level: Exclude<OrganizationPermissionLevel, 'none'>,
): AdminOrganizationPermission {
  return `admin.${area}.${level}`;
}

/**
 * NONE is the absence of both keys, so a level is read rather than stored.
 */
export function adminPermissionLevel(
  granted: Iterable<string>,
  area: AdminPermissionArea,
): OrganizationPermissionLevel {
  const held = expandOrganizationPermissions(granted);
  if (held.has(adminPermissionKey(area, 'manage'))) return 'manage';
  if (held.has(adminPermissionKey(area, 'view'))) return 'view';
  return 'none';
}

/**
 * The closure of a stored grant: its canonical key, its legacy alias, and the
 * view level that manage implies. A caller may ask in either vocabulary.
 */
export function expandOrganizationPermissions(granted: Iterable<string>): Set<string> {
  const held = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value || !PERMISSION_LOOKUP.has(value)) return;
    held.add(value);
    const legacy = CANONICAL_TO_LEGACY.get(value);
    if (legacy) held.add(legacy);
    const canonical = LEGACY_ORGANIZATION_PERMISSION_ALIASES[value as LegacyOrganizationPermission];
    if (canonical) held.add(canonical);
  };

  for (const entry of granted) {
    add(entry);
    const canonical = canonicalOrganizationPermission(entry);
    if (!canonical) continue;
    const manage = /^admin\.([a-z]+)\.manage$/u.exec(canonical);
    if (manage?.[1]) add(`admin.${manage[1]}.view`);
  }
  return held;
}

export const PRIMARY_OWNER_ONLY_PERMISSIONS: readonly OrganizationPermission[] = Object.freeze([
  'admin.ownership.manage',
  'admin.lifecycle.manage',
  'admin.contracts.manage',
  'ownership.transfer',
  'workspace.delete',
  'billing.contracts.manage',
]);

export const GRANTABLE_ORGANIZATION_PERMISSIONS: readonly OrganizationPermission[] = Object.freeze(
  ORGANIZATION_PERMISSIONS.filter(
    (permission) => !PRIMARY_OWNER_ONLY_PERMISSIONS.includes(permission),
  ),
);

export const GRANTABLE_CANONICAL_PERMISSIONS: readonly CanonicalOrganizationPermission[] =
  Object.freeze(
    CANONICAL_ORGANIZATION_PERMISSIONS.filter(
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
  return typeof value === 'string' && PERMISSION_LOOKUP.has(value);
}

export function isCanonicalOrganizationPermission(
  value: unknown,
): value is CanonicalOrganizationPermission {
  return (
    typeof value === 'string' &&
    (CANONICAL_ORGANIZATION_PERMISSIONS as readonly string[]).includes(value)
  );
}

export function isGrantableOrganizationPermission(value: unknown): value is OrganizationPermission {
  return isOrganizationPermission(value) && !PRIMARY_OWNER_ONLY_PERMISSIONS.includes(value);
}

export function hasOrganizationPermission(
  granted: Iterable<string>,
  permission: OrganizationPermission,
): boolean {
  const wanted = canonicalOrganizationPermission(permission) ?? permission;
  for (const entry of granted) {
    if (entry === permission) return true;
    if (canonicalOrganizationPermission(entry) === wanted) return true;
  }
  return false;
}

export function missingOrganizationPermissions(
  granted: Iterable<string>,
  required: Iterable<string>,
): string[] {
  const held = expandOrganizationPermissions(granted);
  return [...new Set(required)].filter((permission) => !held.has(permission)).sort();
}
