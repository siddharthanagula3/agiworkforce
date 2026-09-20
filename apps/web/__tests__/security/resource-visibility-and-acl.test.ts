import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  RESOURCE_LIFECYCLE_SEMANTICS,
  RESOURCE_LIFECYCLE_STATES,
  RESOURCE_PERMISSIONS,
  RESOURCE_ROLES,
  RESOURCE_VISIBILITIES,
  VISIBILITY_GRANTED_PERMISSION,
  canPerformOnResource,
  parseResourceVisibility,
  resolveResourceAccess,
  resourcePermissionsForRole,
  type ResourcePermission,
  type ResourceRole,
  type ResourceVisibility,
} from '@agiworkforce/types';

import { evaluateOrganizationPolicy } from '@/lib/services/organization-policy-evaluator';
import {
  lifecycleStatesExcludedFromAiRetrieval,
  lifecycleStatesExcludedFromSearch,
  readableVisibilities,
} from '@/lib/resources/lifecycle-sql';

const OWNER = 'user_owner';
const MEMBER = 'user_member';
const OUTSIDER = 'user_outsider';
const ORG = 'org_1';

function access(
  visibility: ResourceVisibility,
  viewer: { userId: string | null; organizationId: string | null },
  grantedRole: ResourceRole | null = null,
) {
  return resolveResourceAccess({
    visibility,
    lifecycleState: 'active',
    ownerUserId: OWNER,
    organizationId: ORG,
    viewer: { ...viewer, grantedRole },
  });
}

describe('visibility answers who can find it, never what they may do', () => {
  it('confers exactly one permission however wide it is set', () => {
    for (const visibility of RESOURCE_VISIBILITIES) {
      const decision = access(visibility, { userId: OUTSIDER, organizationId: null });
      if (decision.permissions.length === 0) continue;
      expect(decision.viaVisibility, `${visibility} reached the viewer some other way`).toBe(true);
      expect(decision.permissions, `${visibility} confers more than a read`).toEqual([
        VISIBILITY_GRANTED_PERMISSION,
      ]);
    }
  });

  it('leaves the owner the owner at every visibility', () => {
    for (const visibility of RESOURCE_VISIBILITIES) {
      const decision = access(visibility, { userId: OWNER, organizationId: ORG });
      expect(decision.role, `${visibility} took ownership away`).toBe('owner');
      expect(decision.viaVisibility).toBe(false);
    }
  });

  it('gives a grant what visibility cannot give, at every visibility', () => {
    for (const visibility of RESOURCE_VISIBILITIES) {
      const decision = access(visibility, { userId: MEMBER, organizationId: ORG }, 'editor');
      expect(decision.permissions, `${visibility} dropped the explicit grant`).toContain('edit');
      expect(decision.viaVisibility).toBe(false);
    }
  });

  it('reads an unknown visibility as the narrowest one', () => {
    for (const unknown of ['everyone', 'link', '', null, undefined, 7]) {
      expect(parseResourceVisibility(unknown)).toBe('private');
    }
  });

  it('keeps a private resource private whether or not a link to it exists', () => {
    const linkHolder = { userId: null, organizationId: null };
    expect(access('private', linkHolder).permissions).toEqual([]);
    expect(access('private', { userId: OUTSIDER, organizationId: ORG }).permissions).toEqual([]);
  });

  it('reaches an organization resource only from inside that organization', () => {
    expect(access('organization', { userId: MEMBER, organizationId: ORG }).permissions).toEqual([
      'view',
    ]);
    expect(access('organization', { userId: MEMBER, organizationId: 'org_2' }).permissions).toEqual(
      [],
    );
  });
});

describe('the permission vocabulary is a ladder, and every rung is reachable', () => {
  it('gives each role exactly the permissions below it', () => {
    const byRole = new Map<ResourceRole, readonly ResourcePermission[]>(
      RESOURCE_ROLES.map((role) => [role, resourcePermissionsForRole(role)]),
    );
    for (const [role, permissions] of byRole) {
      expect(permissions.length, `${role} can do nothing`).toBeGreaterThan(0);
      for (const permission of permissions) {
        expect(RESOURCE_PERMISSIONS, `${role} holds an undeclared permission`).toContain(
          permission,
        );
      }
    }
    const sizes = RESOURCE_ROLES.map((role) => byRole.get(role)!.length);
    expect(
      [...sizes].sort((a, b) => b - a),
      'the roles are not ordered by reach',
    ).toEqual(sizes);
  });

  it('leaves no permission that no role can exercise', () => {
    const reachable = new Set(
      RESOURCE_ROLES.flatMap((role) => [...resourcePermissionsForRole(role)]),
    );
    const unreachable = RESOURCE_PERMISSIONS.filter((permission) => !reachable.has(permission));
    expect(unreachable, `declared but unreachable: ${unreachable.join(', ')}`).toEqual([]);
  });

  it('keeps handing the resource on and destroying it to the owner alone', () => {
    for (const permission of ['transfer', 'delete', 'share'] as const) {
      expect(resourcePermissionsForRole('owner')).toContain(permission);
      for (const role of RESOURCE_ROLES.filter((candidate) => candidate !== 'owner')) {
        expect(
          resourcePermissionsForRole(role),
          `${role} can ${permission} the resource`,
        ).not.toContain(permission);
      }
    }
  });

  it('refuses every permission on a resource that is gone, the owner included', () => {
    for (const permission of RESOURCE_PERMISSIONS) {
      expect(
        canPerformOnResource(
          {
            visibility: 'public',
            lifecycleState: 'purged',
            ownerUserId: OWNER,
            organizationId: ORG,
            viewer: { userId: OWNER, organizationId: ORG, grantedRole: 'owner' },
          },
          permission,
        ),
        `${permission} survives a purge`,
      ).toBe(false);
    }
  });
});

describe('what the model and the index are allowed to see', () => {
  it('hides from retrieval everything it hides from search, and never the reverse', () => {
    const search = new Set(lifecycleStatesExcludedFromSearch());
    for (const state of lifecycleStatesExcludedFromAiRetrieval()) {
      expect(search.has(state), `${state} is hidden from the model but still indexed`).toBe(true);
    }
  });

  it('accounts for every lifecycle state the contract declares', () => {
    for (const state of RESOURCE_LIFECYCLE_STATES) {
      const semantics = RESOURCE_LIFECYCLE_SEMANTICS[state];
      expect(semantics, `${state} has no declared semantics`).toBeDefined();
      if (!semantics.searchable) {
        expect(
          lifecycleStatesExcludedFromSearch(),
          `${state} is unsearchable in the contract but the query still returns it`,
        ).toContain(state);
      }
      if (!semantics.aiRetrievable) {
        expect(
          lifecycleStatesExcludedFromAiRetrieval(),
          `${state} is not retrievable in the contract but the query still returns it`,
        ).toContain(state);
      }
    }
  });

  it('narrows the visibilities a query may read to what the viewer is scoped to', () => {
    expect(readableVisibilities({ userId: null, organizationId: null })).toEqual(['public']);
    expect(readableVisibilities({ userId: OUTSIDER, organizationId: null })).not.toContain(
      'organization',
    );
    expect(readableVisibilities({ userId: MEMBER, organizationId: ORG })).toContain('organization');
  });
});

describe('a workspace policy caps how wide a member may share', () => {
  const policy = (externalSharingEnabled: boolean) =>
    evaluateOrganizationPolicy(
      {
        ...DEFAULT_ENTERPRISE_ADMIN_POLICY,
        organizationId: ORG,
        updatedAt: '2026-09-20T00:00:00.000Z',
        externalSharingEnabled,
      },
      { resource: 'external_sharing' },
    );

  it('refuses the widest visibility when the administrator turned it off', () => {
    const decision = policy(false);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('external_sharing_disabled');
  });

  it('allows it again when the administrator turns it back on', () => {
    expect(policy(true).allowed).toBe(true);
  });
});
