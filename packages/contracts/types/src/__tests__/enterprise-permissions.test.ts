import { describe, expect, it } from 'vitest';

import {
  ADMIN_ORGANIZATION_PERMISSIONS,
  ADMIN_PERMISSION_AREAS,
  BUILT_IN_ORGANIZATION_ROLES,
  CANONICAL_ORGANIZATION_PERMISSIONS,
  FEATURE_ORGANIZATION_PERMISSIONS,
  GRANTABLE_ORGANIZATION_PERMISSIONS,
  LEGACY_ORGANIZATION_PERMISSIONS,
  LEGACY_ORGANIZATION_PERMISSION_ALIASES,
  ORGANIZATION_PERMISSIONS,
  PRIMARY_OWNER_ONLY_PERMISSIONS,
  adminPermissionKey,
  adminPermissionLevel,
  canonicalOrganizationPermission,
  expandOrganizationPermissions,
  hasOrganizationPermission,
  isGrantableOrganizationPermission,
  isOrganizationPermission,
  legacyOrganizationPermission,
  missingOrganizationPermissions,
} from '../enterprise/permissions';

describe('namespaced permission registry', () => {
  it('names every canonical permission feature.* or admin.*', () => {
    for (const permission of CANONICAL_ORGANIZATION_PERMISSIONS) {
      expect(permission).toMatch(/^(feature|admin)\.[a-z]+\.[a-z]+$/u);
    }
  });

  it('separates the feature registry from the admin registry', () => {
    for (const permission of FEATURE_ORGANIZATION_PERMISSIONS) {
      expect(permission.startsWith('feature.')).toBe(true);
    }
    for (const permission of ADMIN_ORGANIZATION_PERMISSIONS) {
      expect(permission.startsWith('admin.')).toBe(true);
    }
    expect(
      FEATURE_ORGANIZATION_PERMISSIONS.filter((permission) =>
        (ADMIN_ORGANIZATION_PERMISSIONS as readonly string[]).includes(permission),
      ),
    ).toEqual([]);
  });

  it('gives every admin area a view level and a manage level', () => {
    for (const area of ADMIN_PERMISSION_AREAS) {
      expect(ADMIN_ORGANIZATION_PERMISSIONS).toContain(adminPermissionKey(area, 'view'));
      expect(ADMIN_ORGANIZATION_PERMISSIONS).toContain(adminPermissionKey(area, 'manage'));
    }
    expect(ADMIN_ORGANIZATION_PERMISSIONS).toHaveLength(ADMIN_PERMISSION_AREAS.length * 2);
  });

  it('reads NONE, VIEW and MANAGE off a grant for every admin area', () => {
    for (const area of ADMIN_PERMISSION_AREAS) {
      expect(adminPermissionLevel([], area)).toBe('none');
      expect(adminPermissionLevel([adminPermissionKey(area, 'view')], area)).toBe('view');
      expect(adminPermissionLevel([adminPermissionKey(area, 'manage')], area)).toBe('manage');
    }
  });
});

describe('alias layer for the keys the grid shipped with', () => {
  it('maps every legacy key to exactly one canonical key', () => {
    expect(LEGACY_ORGANIZATION_PERMISSIONS).toHaveLength(18);
    const canonical = new Set<string>();
    for (const legacy of LEGACY_ORGANIZATION_PERMISSIONS) {
      const target = LEGACY_ORGANIZATION_PERMISSION_ALIASES[legacy];
      expect(CANONICAL_ORGANIZATION_PERMISSIONS).toContain(target);
      expect(canonical.has(target)).toBe(false);
      canonical.add(target);
      expect(legacyOrganizationPermission(target)).toBe(legacy);
    }
  });

  it('keeps a stored legacy grant resolving in both vocabularies', () => {
    const held = expandOrganizationPermissions(['audit.read', 'policy.manage']);
    expect(held.has('audit.read')).toBe(true);
    expect(held.has('admin.audit.view')).toBe(true);
    expect(held.has('policy.manage')).toBe(true);
    expect(held.has('admin.policy.manage')).toBe(true);
  });

  it('lets manage imply view, in both vocabularies', () => {
    const held = expandOrganizationPermissions(['admin.identity.manage']);
    expect(held.has('admin.identity.view')).toBe(true);
    expect(held.has('identity.read')).toBe(true);
    expect(held.has('identity.manage')).toBe(true);
  });

  it('does not invent a permission from an unknown key', () => {
    expect([...expandOrganizationPermissions(['admin.nonsense.manage', 'nope'])]).toEqual([]);
    expect(canonicalOrganizationPermission('nope')).toBeNull();
    expect(isOrganizationPermission('nope')).toBe(false);
  });

  it('answers a legacy question with a namespaced grant and the reverse', () => {
    expect(hasOrganizationPermission(['admin.roles.manage'], 'roles.manage')).toBe(true);
    expect(hasOrganizationPermission(['roles.manage'], 'admin.roles.manage')).toBe(true);
    expect(hasOrganizationPermission(['roles.manage'], 'admin.owners.manage')).toBe(false);
  });

  it('holds both forms of every permission in the registry', () => {
    expect(ORGANIZATION_PERMISSIONS).toHaveLength(
      CANONICAL_ORGANIZATION_PERMISSIONS.length + LEGACY_ORGANIZATION_PERMISSIONS.length,
    );
    expect(new Set(ORGANIZATION_PERMISSIONS).size).toBe(ORGANIZATION_PERMISSIONS.length);
  });
});

describe('the three Primary Owner permissions', () => {
  it('reserves both forms of each', () => {
    for (const legacy of ['ownership.transfer', 'workspace.delete', 'billing.contracts.manage']) {
      const canonical = LEGACY_ORGANIZATION_PERMISSION_ALIASES[legacy as 'workspace.delete'];
      expect(PRIMARY_OWNER_ONLY_PERMISSIONS).toContain(legacy);
      expect(PRIMARY_OWNER_ONLY_PERMISSIONS).toContain(canonical);
      expect(isGrantableOrganizationPermission(legacy)).toBe(false);
      expect(isGrantableOrganizationPermission(canonical)).toBe(false);
    }
  });

  it('keeps them out of every assignable built-in role', () => {
    for (const role of Object.values(BUILT_IN_ORGANIZATION_ROLES)) {
      if (!role.assignable) continue;
      for (const permission of role.permissions) {
        expect(PRIMARY_OWNER_ONLY_PERMISSIONS).not.toContain(permission);
      }
    }
    expect(GRANTABLE_ORGANIZATION_PERMISSIONS).not.toContain('admin.lifecycle.manage');
  });
});

describe('missingOrganizationPermissions', () => {
  it('accepts a legacy grant as cover for the namespaced requirement', () => {
    expect(missingOrganizationPermissions(['policy.manage'], ['admin.policy.manage'])).toEqual([]);
    expect(missingOrganizationPermissions(['admin.policy.manage'], ['policy.manage'])).toEqual([]);
  });

  it('still names what the actor does not hold', () => {
    expect(missingOrganizationPermissions(['content.read'], ['admin.roles.manage'])).toEqual([
      'admin.roles.manage',
    ]);
  });

  it('does not let view cover manage', () => {
    expect(missingOrganizationPermissions(['audit.read'], ['admin.audit.manage'])).toEqual([
      'admin.audit.manage',
    ]);
  });
});
