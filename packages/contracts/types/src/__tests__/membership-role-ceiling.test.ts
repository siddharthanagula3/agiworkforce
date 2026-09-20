import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_ORGANIZATION_ROLES,
  builtInRoleKeyForMembershipRole,
  expandOrganizationPermissions,
  type BuiltInOrganizationRoleKey,
} from '../enterprise/permissions';
import { membershipRolePermissionsBeyondGranter } from '../enterprise/authorization';
import type { OrganizationRole } from '../enterprise';

const MEMBERSHIP_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'member', 'viewer'];

function permissionsOf(role: OrganizationRole): readonly string[] {
  return BUILT_IN_ORGANIZATION_ROLES[builtInRoleKeyForMembershipRole(role)].permissions;
}

describe('a membership role never travels above its granter', () => {
  it('lets every role confer itself and refuses nothing it already carries', () => {
    for (const role of MEMBERSHIP_ROLES) {
      expect(membershipRolePermissionsBeyondGranter(permissionsOf(role), role)).toEqual([]);
    }
  });

  it('names what each granter lacks, for every ordered pair of roles', () => {
    for (const granter of MEMBERSHIP_ROLES) {
      const held = expandOrganizationPermissions(permissionsOf(granter));
      for (const conferred of MEMBERSHIP_ROLES) {
        const beyond = membershipRolePermissionsBeyondGranter(permissionsOf(granter), conferred);
        const expected = [...new Set(permissionsOf(conferred))]
          .filter(
            (permission) => !held.has(permission) && !permissionsOf('member').includes(permission),
          )
          .sort();
        expect(beyond).toEqual(expected);
      }
    }
  });

  it('lets a member manager with no content access still seat members and viewers', () => {
    expect(membershipRolePermissionsBeyondGranter(['members.manage'], 'viewer')).toEqual([]);
    expect(membershipRolePermissionsBeyondGranter(['members.manage'], 'member')).toEqual([]);
  });

  it('refuses admin to a holder of members.manage alone', () => {
    const beyond = membershipRolePermissionsBeyondGranter(['members.manage'], 'admin');
    expect(beyond).toContain('policy.manage');
    expect(beyond).toContain('roles.manage');
    expect(beyond).toContain('audit.read');
  });

  it('accepts the namespaced spelling of a grant as cover', () => {
    const canonical = permissionsOf('member').map(
      (permission) => `feature.content.${permission === 'content.read' ? 'view' : 'share'}`,
    );
    expect(membershipRolePermissionsBeyondGranter(canonical, 'member')).toEqual([]);
  });

  it('keeps the owner bundle out of reach of every assignable role', () => {
    for (const key of Object.keys(BUILT_IN_ORGANIZATION_ROLES) as BuiltInOrganizationRoleKey[]) {
      if (!BUILT_IN_ORGANIZATION_ROLES[key].assignable) continue;
      expect(
        membershipRolePermissionsBeyondGranter(
          BUILT_IN_ORGANIZATION_ROLES[key].permissions,
          'owner',
        ).length,
      ).toBeGreaterThan(0);
    }
  });
});
