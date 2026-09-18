import { describe, expect, it } from 'vitest';
import {
  AUTHORIZATION_PRECEDENCE,
  AUTHORIZATION_STAGES,
  BUILT_IN_ORGANIZATION_ROLES,
  DEFAULT_WORKSPACE_CONTROLS,
  ENTERPRISE_DENIAL_STAGE,
  GRANTABLE_ORGANIZATION_PERMISSIONS,
  PRIMARY_OWNER_ONLY_PERMISSIONS,
  WORKSPACE_POLICY_OVERRIDE_SUBJECTS,
  WORKSPACE_POLICY_SCOPES,
  builtInRoleKeyForMembershipRole,
  clampReasoningEffort,
  evaluateAuthorization,
  isGrantableOrganizationPermission,
  missingOrganizationPermissions,
  resolveDefaultModelId,
  resolveEffectivePermissions,
  resolveWorkspaceControls,
  type AuthorizationSubject,
  type WorkspaceControls,
  type WorkspacePolicyOverride,
  type WorkspacePolicyOverrideSubject,
} from '../enterprise';

function override(
  subjectType: WorkspacePolicyOverrideSubject,
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

  it('refuses to let a user exception re-enable what a group or the workspace denied', () => {
    const resolved = resolveWorkspaceControls(workspace, [
      override('group', 'contractors', { featureAccess: { research: false } }),
      override('user', 'u-1', { featureAccess: { research: true, code: true } }),
    ]);
    expect(resolved.featureAccess.research).toBe(false);
    expect(resolved.featureAccess.code).toBe(false);
  });

  it('applies group overrides over role overrides', () => {
    const resolved = resolveWorkspaceControls(workspace, [
      override('role', 'engineering', { featureAccess: { work: true } }),
      override('group', 'interns', { featureAccess: { work: false } }),
    ]);
    expect(resolved.featureAccess.work).toBe(false);
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

const governed: WorkspaceControls = {
  ...DEFAULT_WORKSPACE_CONTROLS,
  featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, browser: false },
  maxReasoningEffort: 'high',
  allowedCountries: ['US', 'DE', 'FR'],
  allowedSurfaces: ['web', 'desktop', 'cli'],
};

describe('settings scopes', () => {
  it('names the workspace scope plus every override scope, workspace first', () => {
    expect(WORKSPACE_POLICY_SCOPES[0]).toBe('workspace');
    expect(WORKSPACE_POLICY_SCOPES.slice(1)).toEqual([...WORKSPACE_POLICY_OVERRIDE_SUBJECTS]);
    expect(WORKSPACE_POLICY_OVERRIDE_SUBJECTS).toEqual([
      'role',
      'group',
      'project',
      'device',
      'user',
    ]);
  });

  it('resolves project and device layers alongside role, group and user layers', () => {
    const resolved = resolveWorkspaceControls(DEFAULT_WORKSPACE_CONTROLS, [
      override('role', 'r-1', { featureAccess: { code: false } }),
      override('group', 'g-1', { featureAccess: { research: false } }),
      override('project', 'p-1', { featureAccess: { plugins: false } }),
      override('device', 'd-1', { featureAccess: { computer_use: false } }),
      override('user', 'u-1', { featureAccess: { schedules: false } }),
    ]);

    expect(resolved.featureAccess.code).toBe(false);
    expect(resolved.featureAccess.research).toBe(false);
    expect(resolved.featureAccess.plugins).toBe(false);
    expect(resolved.featureAccess.computer_use).toBe(false);
    expect(resolved.featureAccess.schedules).toBe(false);
    expect(resolved.appliedOverrideIds).toHaveLength(5);
  });

  it('is deterministic whatever order the layers arrive in', () => {
    const layers = [
      override('user', 'u-1', { maxReasoningEffort: 'medium' }),
      override('project', 'p-1', { allowedSurfaces: ['web', 'cli'] }),
      override('role', 'r-1', { allowedCountries: ['US', 'DE'] }),
      override('device', 'd-1', { featureAccess: { browser: true } }),
    ];
    const forwards = resolveWorkspaceControls(governed, layers, 7);
    const backwards = resolveWorkspaceControls(governed, [...layers].reverse(), 7);
    expect(backwards).toEqual(forwards);
  });
});

describe('a later layer may only narrow', () => {
  it('keeps an organization-wide deny that a group and a user exception both try to lift', () => {
    const resolved = resolveWorkspaceControls(governed, [
      override('group', 'g-1', { featureAccess: { browser: true } }),
      override('user', 'u-1', { featureAccess: { browser: true } }),
    ]);
    expect(resolved.featureAccess.browser).toBe(false);
  });

  it('never raises a reasoning cap, widens a country list or adds a surface', () => {
    const resolved = resolveWorkspaceControls(governed, [
      override('user', 'u-1', {
        maxReasoningEffort: 'max',
        allowedCountries: ['US', 'DE', 'FR', 'BR'],
        allowedSurfaces: ['web', 'desktop', 'cli', 'mobile'],
      }),
    ]);
    expect(resolved.maxReasoningEffort).toBe('high');
    expect(resolved.allowedCountries).toEqual(['US', 'DE', 'FR']);
    expect(resolved.allowedSurfaces).toEqual(['web', 'desktop', 'cli']);
  });
});

describe('rule version and blocking rules', () => {
  it('returns the rule version it was resolved from', () => {
    expect(resolveWorkspaceControls(governed, [], 42).revision).toBe(42);
    expect(resolveWorkspaceControls(governed, []).revision).toBe(0);
  });

  it('names the layer that narrowed each control', () => {
    const resolved = resolveWorkspaceControls(governed, [
      override('group', 'g-1', { maxReasoningEffort: 'low' }),
    ]);

    const workspaceRules = resolved.blockingRules.filter((rule) => rule.scope === 'workspace');
    expect(workspaceRules.map((rule) => rule.control)).toEqual(
      expect.arrayContaining(['feature', 'reasoning_effort', 'country', 'surface']),
    );

    const groupRule = resolved.blockingRules.find((rule) => rule.scope === 'group');
    expect(groupRule).toMatchObject({
      control: 'reasoning_effort',
      overrideId: 'group-g-1',
      subjectId: 'g-1',
      reason: 'reasoning_effort_capped',
    });
  });

  it('records no blocking rule for a workspace that restricts nothing', () => {
    expect(resolveWorkspaceControls(DEFAULT_WORKSPACE_CONTROLS, []).blockingRules).toEqual([]);
  });
});

describe('a default model is not a grant', () => {
  it('takes the most specific layer that sets one', () => {
    const resolved = resolveWorkspaceControls(governed, [
      override('role', 'r-1', { defaultModelId: 'role-model' }),
      override('user', 'u-1', { defaultModelId: 'user-model' }),
    ]);
    expect(resolved.defaultModelId).toBe('user-model');
  });

  it('drops a default the model policy does not permit', () => {
    expect(resolveDefaultModelId('m-1', { allowedModelIds: ['m-2'] })).toEqual({
      modelId: null,
      resolution: 'not_permitted',
    });
    expect(resolveDefaultModelId('m-1', { blockedModelIds: ['m-1'] })).toEqual({
      modelId: null,
      resolution: 'not_permitted',
    });
    expect(resolveDefaultModelId('m-1', { allowedModelIds: ['m-1'] })).toEqual({
      modelId: 'm-1',
      resolution: 'permitted',
    });
    expect(resolveDefaultModelId(null, {})).toEqual({ modelId: null, resolution: 'not_set' });
  });
});

describe('authorization precedence', () => {
  function subject(patch: Partial<AuthorizationSubject> = {}): AuthorizationSubject {
    return {
      organizationId: 'org-1',
      isMember: true,
      isPrimaryOwner: false,
      permissions: ['content.read', 'content.share'],
      entitledFeatures: null,
      controls: DEFAULT_WORKSPACE_CONTROLS,
      policyRevision: 3,
      ...patch,
    };
  }

  it('states one stage per step, in order, each of which may only narrow', () => {
    expect(AUTHORIZATION_PRECEDENCE.map((stage) => stage.stage)).toEqual([...AUTHORIZATION_STAGES]);
    for (const stage of AUTHORIZATION_PRECEDENCE) {
      expect(stage.effectOnEarlierStages).toBe('narrow');
    }
  });

  it('answers with the earliest refusal, not an incidental later one', () => {
    const decision = evaluateAuthorization(
      subject({
        isMember: false,
        controls: {
          ...DEFAULT_WORKSPACE_CONTROLS,
          featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, code: false },
        },
      }),
      { permission: 'policy.manage', feature: 'code' },
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.denial.code).toBe('not_a_member');
    expect(decision.denial.stage).toBe('membership');
  });

  it('refuses a capability the plan does not include even to a permitted member', () => {
    const decision = evaluateAuthorization(
      subject({ permissions: ['content.read'], entitledFeatures: ['work'] }),
      { feature: 'code' },
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.denial.code).toBe('plan_does_not_include');
  });

  it('lets policy refuse a feature the member holds every permission for', () => {
    const decision = evaluateAuthorization(
      subject({
        permissions: ['content.read', 'content.share', 'policy.manage'],
        controls: {
          ...DEFAULT_WORKSPACE_CONTROLS,
          featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, browser: false },
        },
      }),
      { permission: 'policy.manage', feature: 'browser' },
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.denial.code).toBe('feature_disabled');
    expect(decision.denial.stage).toBe('policy');
    expect(decision.denial.blockingRule).toBe('featureAccess.browser');
    expect(decision.denial.policyRevision).toBe(3);
  });

  it('withholds a rollout without ever granting one', () => {
    const withheld = evaluateAuthorization(subject({ withheldByRollout: ['work'] }), {
      feature: 'work',
    });
    expect(withheld.allowed).toBe(false);
    if (withheld.allowed) return;
    expect(withheld.denial.code).toBe('rollout_withheld');
  });

  it('gives every denial code a stage', () => {
    for (const [code, stage] of Object.entries(ENTERPRISE_DENIAL_STAGE)) {
      expect(AUTHORIZATION_STAGES, code).toContain(stage);
    }
  });

  it('answers personal scope without a workspace to govern it', () => {
    const decision = evaluateAuthorization(subject({ organizationId: null, isMember: false }), {
      feature: 'code',
    });
    expect(decision.allowed).toBe(true);
  });
});

describe('effective permissions', () => {
  it('unions every grant and names what conferred each permission', () => {
    const effective = resolveEffectivePermissions({
      isPrimaryOwner: false,
      grants: [
        { source: 'membership:member', permissions: ['content.read', 'content.share'] },
        { source: 'group:Engineering:admin', permissions: ['content.read', 'policy.manage'] },
      ],
    });
    expect([...effective.permissions].sort()).toEqual([
      'content.read',
      'content.share',
      'policy.manage',
    ]);
    expect(effective.grantedBy['content.read']).toEqual([
      'group:Engineering:admin',
      'membership:member',
    ]);
  });

  it('keeps the three ownership permissions from anyone but the Primary Owner', () => {
    const escalated = resolveEffectivePermissions({
      isPrimaryOwner: false,
      grants: [{ source: 'role:custom', permissions: ['workspace.delete'] }],
    });
    expect(escalated.permissions.has('workspace.delete')).toBe(false);
    expect(escalated.withheld['workspace.delete']).toBe('primary_owner_only');

    const owner = resolveEffectivePermissions({
      isPrimaryOwner: true,
      grants: [{ source: 'membership:primary_owner', permissions: ['workspace.delete'] }],
    });
    expect(owner.permissions.has('workspace.delete')).toBe(true);
  });

  it('lets a policy deny outrank however many roles granted it', () => {
    const effective = resolveEffectivePermissions({
      isPrimaryOwner: false,
      deniedPermissions: ['content.share'],
      grants: [
        { source: 'role:a', permissions: ['content.share'] },
        { source: 'role:b', permissions: ['content.share'] },
        { source: 'group:g', permissions: ['content.share'] },
      ],
    });
    expect(effective.permissions.has('content.share')).toBe(false);
    expect(effective.withheld['content.share']).toBe('policy_denied');
  });
});
