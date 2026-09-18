import { describe, expect, it, vi } from 'vitest';
import {
  RESOURCE_PERMISSIONS,
  resolveResourceAccess,
  resourcePermissionsForRole,
  roleCanPerform,
} from '@agiworkforce/types';
import {
  canPerformOnOrganization,
  ownedResourceAccess,
  resourceRoleForOrganizationRole,
} from '../resource-acl';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const OWNER = 'user-owner';
const OUTSIDER = 'user-outsider';
const ORG = '11111111-1111-4111-8111-111111111111';

describe('resource visibility is separate from permission and from ownership', () => {
  it('gives a public resource a reader and nothing else', () => {
    const decision = resolveResourceAccess({
      visibility: 'public',
      lifecycleState: 'active',
      ownerUserId: OWNER,
      organizationId: null,
      viewer: { userId: OUTSIDER, organizationId: null },
    });

    expect(decision.role).toBe('viewer');
    expect(decision.viaVisibility).toBe(true);
    expect(decision.permissions).toEqual(['view']);
    for (const permission of RESOURCE_PERMISSIONS) {
      if (permission === 'view') continue;
      expect(decision.permissions, permission).not.toContain(permission);
    }
  });

  it('does not make a public resource ownerless', () => {
    const decision = resolveResourceAccess({
      visibility: 'public',
      lifecycleState: 'active',
      ownerUserId: OWNER,
      organizationId: null,
      viewer: { userId: OWNER, organizationId: null },
    });

    expect(decision.role).toBe('owner');
    expect(decision.viaVisibility).toBe(false);
    expect(decision.permissions).toContain('transfer');
  });

  it('reaches an organization-visible resource only from inside that organization', () => {
    const inside = ownedResourceAccess({
      ownerUserId: OWNER,
      organizationId: ORG,
      visibility: 'organization',
      lifecycleState: 'active',
      viewerUserId: OUTSIDER,
      viewerOrganizationId: ORG,
    });
    expect(inside.permissions).toEqual(['view']);

    const outside = ownedResourceAccess({
      ownerUserId: OWNER,
      organizationId: ORG,
      visibility: 'organization',
      lifecycleState: 'active',
      viewerUserId: OUTSIDER,
      viewerOrganizationId: null,
    });
    expect(outside.role).toBeNull();
    expect(outside.permissions).toEqual([]);
  });

  it('keeps a private resource private however the viewer is scoped', () => {
    const decision = ownedResourceAccess({
      ownerUserId: OWNER,
      organizationId: ORG,
      visibility: 'private',
      lifecycleState: 'active',
      viewerUserId: OUTSIDER,
      viewerOrganizationId: ORG,
    });
    expect(decision.permissions).toEqual([]);
  });

  it('lets an explicit grant carry edit and comment, which visibility never does', () => {
    const editor = ownedResourceAccess({
      ownerUserId: OWNER,
      organizationId: ORG,
      visibility: 'private',
      lifecycleState: 'active',
      viewerUserId: OUTSIDER,
      viewerOrganizationId: ORG,
      grantedRole: 'editor',
    });
    expect(editor.permissions).toEqual(['view', 'comment', 'edit']);
    expect(editor.viaVisibility).toBe(false);
    expect(editor.permissions).not.toContain('share');
  });

  it('models comment as its own permission, below edit', () => {
    expect(resourcePermissionsForRole('commenter')).toEqual(['view', 'comment']);
    expect(roleCanPerform('commenter', 'edit')).toBe(false);
    expect(roleCanPerform('viewer', 'comment')).toBe(false);
  });

  it('hides a soft-deleted resource from everyone but its owner, and a purged one from all', () => {
    const base = {
      visibility: 'public',
      organizationId: null,
      viewer: { userId: OUTSIDER, organizationId: null },
    } as const;

    expect(
      resolveResourceAccess({ ...base, lifecycleState: 'soft_deleted', ownerUserId: OWNER })
        .permissions,
    ).toEqual([]);
    expect(
      resolveResourceAccess({
        ...base,
        lifecycleState: 'soft_deleted',
        ownerUserId: OWNER,
        viewer: { userId: OWNER, organizationId: null },
      }).role,
    ).toBe('owner');
    expect(
      resolveResourceAccess({
        ...base,
        lifecycleState: 'purged',
        ownerUserId: OWNER,
        viewer: { userId: OWNER, organizationId: null },
      }).permissions,
    ).toEqual([]);
  });
});

describe('workspace membership read as a resource role', () => {
  it('gives transfer and delete to the Primary Owner alone', () => {
    expect(resourceRoleForOrganizationRole('owner')).toBe('owner');
    expect(
      canPerformOnOrganization(
        { organizationId: ORG, viewerUserId: OWNER, membership: { role: 'owner' } },
        'transfer',
      ),
    ).toBe(true);

    for (const role of ['admin', 'member', 'viewer'] as const) {
      expect(
        canPerformOnOrganization(
          { organizationId: ORG, viewerUserId: OUTSIDER, membership: { role } },
          'transfer',
        ),
        role,
      ).toBe(false);
    }
  });

  it('refuses a non-member outright', () => {
    expect(
      canPerformOnOrganization(
        { organizationId: ORG, viewerUserId: OUTSIDER, membership: null },
        'view',
      ),
    ).toBe(false);
  });

  it('lets an admin edit without letting them hand the workspace away', () => {
    const admin = {
      organizationId: ORG,
      viewerUserId: OUTSIDER,
      membership: { role: 'admin' },
    } as const;
    expect(canPerformOnOrganization(admin, 'edit')).toBe(true);
    expect(canPerformOnOrganization(admin, 'share')).toBe(false);
    expect(canPerformOnOrganization(admin, 'delete')).toBe(false);
  });
});
