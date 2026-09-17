import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ORGANIZATION_ROLES,
  DEFAULT_WORKSPACE_CONTROLS,
  GRANTABLE_ORGANIZATION_PERMISSIONS,
  PRIMARY_OWNER_ONLY_PERMISSIONS,
  builtInRoleKeyForMembershipRole,
  clampReasoningEffort,
  isGrantableOrganizationPermission,
  missingOrganizationPermissions,
  resolveWorkspaceControls,
  type WorkspaceControls,
  type WorkspacePolicyOverride,
} from '../enterprise';

function override(
  subjectType: WorkspacePolicyOverride['subjectType'],
  subjectId: string,
  layer: WorkspacePolicyOverride['layer'],
): WorkspacePolicyOverride {
  return {
    id: `${subjectType}-${subjectId}`,
    organizationId: 'org-1',
    subjectType,
    subjectId,
    layer,
    updatedAt: '2026-09-17T00:00:00.000Z',
  };
}

const workspace: WorkspaceControls = {
  ...DEFAULT_WORKSPACE_CONTROLS,
  featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, code: false },
  maxReasoningEffort: 'high',
};

describe('organization permission grid', () => {
  it('gives the Primary Owner alone the three ownership permissions', () => {
    for (const [key, role] of Object.entries(BUILT_IN_ORGANIZATION_ROLES)) {
      const holdsOwnership = PRIMARY_OWNER_ONLY_PERMISSIONS.some((p) =>
        role.permissions.includes(p),
      );
      expect(holdsOwnership, key).toBe(key === 'primary_owner');
    }
    expect(BUILT_IN_ORGANIZATION_ROLES.primary_owner.assignable).toBe(false);
  });

  it('keeps Owner distinct from Primary Owner and above Admin', () => {
    const owner = new Set(BUILT_IN_ORGANIZATION_ROLES.owner.permissions);
    expect([...GRANTABLE_ORGANIZATION_PERMISSIONS].every((p) => owner.has(p))).toBe(true);
    expect(BUILT_IN_ORGANIZATION_ROLES.admin.permissions.every((p) => owner.has(p))).toBe(true);
    expect(BUILT_IN_ORGANIZATION_ROLES.admin.permissions).not.toContain('owners.manage');
  });

  it('makes a viewer read-only and a member able to share', () => {
    expect(BUILT_IN_ORGANIZATION_ROLES.viewer.permissions).toEqual(['content.read']);
    expect(BUILT_IN_ORGANIZATION_ROLES.member.permissions).toContain('content.share');
  });

  it('maps the membership owner to the Primary Owner role and every other role to itself', () => {
    expect(builtInRoleKeyForMembershipRole('owner')).toBe('primary_owner');
    expect(builtInRoleKeyForMembershipRole('viewer')).toBe('viewer');
  });

  it('never treats a Primary Owner permission as grantable', () => {
    expect(isGrantableOrganizationPermission('workspace.delete')).toBe(false);
    expect(isGrantableOrganizationPermission('audit.read')).toBe(true);
    expect(isGrantableOrganizationPermission('made.up')).toBe(false);
  });

  it('names exactly the permissions a granter lacks', () => {
    expect(
      missingOrganizationPermissions(['content.read'], ['content.read', 'policy.manage']),
    ).toEqual(['policy.manage']);
  });
});

describe('resolveWorkspaceControls', () => {
  it('returns the workspace defaults when nothing overrides them', () => {
    const resolved = resolveWorkspaceControls(workspace, []);
    expect(resolved.featureAccess.code).toBe(false);
    expect(resolved.appliedOverrideIds).toEqual([]);
  });

  it('lets a user exception win over a group that narrowed the same feature', () => {
    const resolved = resolveWorkspaceControls(workspace, [
      override('group', 'contractors', { featureAccess: { research: false } }),
      override('user', 'u-1', { featureAccess: { research: true, code: true } }),
    ]);
    expect(resolved.featureAccess.research).toBe(true);
    expect(resolved.featureAccess.code).toBe(true);
  });

  it('applies group overrides over role overrides', () => {
    const resolved = resolveWorkspaceControls(workspace, [
      override('role', 'engineering', { featureAccess: { code: true } }),
      override('group', 'interns', { featureAccess: { code: false } }),
    ]);
    expect(resolved.featureAccess.code).toBe(false);
  });

  it('takes the most restrictive value when a member is in two groups', () => {
    const resolved = resolveWorkspaceControls(workspace, [
      override('group', 'a', { featureAccess: { browser: true }, maxReasoningEffort: 'medium' }),
      override('group', 'b', { featureAccess: { browser: false }, maxReasoningEffort: 'low' }),
    ]);
    expect(resolved.featureAccess.browser).toBe(false);
    expect(resolved.maxReasoningEffort).toBe('low');
  });

  it('intersects country and surface restrictions inside one tier', () => {
    const resolved = resolveWorkspaceControls(workspace, [
      override('role', 'r1', { allowedCountries: ['US', 'DE'], allowedSurfaces: ['web', 'cli'] }),
      override('role', 'r2', { allowedCountries: ['DE', 'FR'], allowedSurfaces: ['web'] }),
    ]);
    expect(resolved.allowedCountries).toEqual(['DE']);
    expect(resolved.allowedSurfaces).toEqual(['web']);
  });

  it('keeps workspace settings a layer does not mention', () => {
    const resolved = resolveWorkspaceControls(workspace, [
      override('user', 'u-1', { defaultModelId: 'model-x' }),
    ]);
    expect(resolved.maxReasoningEffort).toBe('high');
    expect(resolved.defaultModelId).toBe('model-x');
  });
});

describe('clampReasoningEffort', () => {
  it('lowers an effort above the workspace maximum and leaves one below it alone', () => {
    expect(clampReasoningEffort('xhigh', 'medium')).toBe('medium');
    expect(clampReasoningEffort('low', 'medium')).toBe('low');
    expect(clampReasoningEffort('high', null)).toBe('high');
    expect(clampReasoningEffort(undefined, 'low')).toBeUndefined();
  });
});
