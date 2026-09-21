import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_CODE_CONTROLS,
  DEFAULT_WORKSPACE_CONTROLS,
  evaluateAuthorization,
  evaluateWorkspaceCodeAct,
  WORKSPACE_CODE_TOGGLE_KEYS,
  WORKSPACE_FEATURES,
  type AuthorizationSubject,
  type EffectiveWorkspaceCodeControls,
  type EffectiveWorkspacePolicyResponse,
  type WorkspaceCodeAct,
  type WorkspaceCodeToggleKey,
  type WorkspaceControls,
  type WorkspaceFeature,
} from '@agiworkforce/types';

import {
  disabledWorkspaceFeatures,
  isWorkspaceCodeConnectionAllowed,
  isWorkspaceCodeHostAllowed,
  isWorkspaceFeatureEnabled,
  parseEffectiveWorkspacePolicy,
  workspaceCodeSessionRetentionDays,
} from '../workspacePolicy';

const ORGANIZATION_ID = 'org_agreement';
const REVISION = 7;

function controlsWith(disabled: readonly WorkspaceFeature[]): WorkspaceControls {
  return {
    ...DEFAULT_WORKSPACE_CONTROLS,
    featureAccess: Object.fromEntries(
      WORKSPACE_FEATURES.map((feature) => [feature, !disabled.includes(feature)]),
    ) as WorkspaceControls['featureAccess'],
  };
}

function subject(controls: WorkspaceControls): AuthorizationSubject {
  return {
    organizationId: ORGANIZATION_ID,
    isMember: true,
    isPrimaryOwner: false,
    permissions: [],
    entitledFeatures: null,
    controls,
    policyRevision: REVISION,
  };
}

function policy(controls: WorkspaceControls | null): EffectiveWorkspacePolicyResponse {
  return {
    organizationId: ORGANIZATION_ID,
    governed: controls !== null,
    revision: REVISION,
    controls,
  } as EffectiveWorkspacePolicyResponse;
}

function serverAllows(controls: WorkspaceControls, feature: WorkspaceFeature): boolean {
  return evaluateAuthorization(subject(controls), { feature }).allowed;
}

describe('the client shows exactly what the server allows', () => {
  it('agrees on every feature, in both states, one feature at a time', () => {
    for (const feature of WORKSPACE_FEATURES) {
      for (const disabled of [[], [feature]] as WorkspaceFeature[][]) {
        const controls = controlsWith(disabled);
        expect({
          feature,
          disabled: disabled.length > 0,
          client: isWorkspaceFeatureEnabled(policy(controls), feature),
        }).toEqual({
          feature,
          disabled: disabled.length > 0,
          client: serverAllows(controls, feature),
        });
      }
    }
  });

  it('agrees on every feature when an administrator turns several off at once', () => {
    const disabled = WORKSPACE_FEATURES.filter((_, index) => index % 3 === 0);
    const controls = controlsWith(disabled);
    for (const feature of WORKSPACE_FEATURES) {
      expect(isWorkspaceFeatureEnabled(policy(controls), feature)).toBe(
        serverAllows(controls, feature),
      );
    }
  });

  it('lists as hidden exactly the features the server refuses', () => {
    const disabled = WORKSPACE_FEATURES.filter((_, index) => index % 2 === 1);
    const controls = controlsWith(disabled);
    expect(disabledWorkspaceFeatures(policy(controls))).toEqual(
      WORKSPACE_FEATURES.filter((feature) => !serverAllows(controls, feature)),
    );
  });

  it('shows everything in an ungoverned workspace, which is what the server answers', () => {
    const personal: AuthorizationSubject = { ...subject(DEFAULT_WORKSPACE_CONTROLS) };
    personal.organizationId = null;
    for (const feature of WORKSPACE_FEATURES) {
      expect(isWorkspaceFeatureEnabled(policy(null), feature)).toBe(
        evaluateAuthorization(personal, { feature }).allowed,
      );
    }
    expect(disabledWorkspaceFeatures(policy(null))).toEqual([]);
  });

  it('shows everything before the first policy arrives, and the server is the gate', () => {
    for (const feature of WORKSPACE_FEATURES) {
      expect(isWorkspaceFeatureEnabled(null, feature)).toBe(true);
      expect(serverAllows(controlsWith([feature]), feature)).toBe(false);
    }
  });
});

const CODE_ACT_FOR: Readonly<Record<WorkspaceCodeToggleKey, WorkspaceCodeAct>> = {
  allowDesktopCloudSync: { act: 'open_cloud_session', surface: 'desktop' },
  allowGithubConnection: { act: 'connect_github' },
  allowAutomatedReview: { act: 'review_pull_request' },
  allowMcpServers: { act: 'use_mcp_server' },
};

function codePolicy(
  code: Partial<EffectiveWorkspaceCodeControls> | null,
): EffectiveWorkspacePolicyResponse {
  return {
    organizationId: ORGANIZATION_ID,
    governed: true,
    revision: REVISION,
    controls: controlsWith([]),
    code: code
      ? ({
          ...DEFAULT_WORKSPACE_CODE_CONTROLS,
          appliedOverrideIds: [],
          revision: REVISION,
          blockingRules: [],
          ...code,
        } as EffectiveWorkspaceCodeControls)
      : null,
  } as EffectiveWorkspacePolicyResponse;
}

describe('the client reads the Code controls the server resolved', () => {
  it('agrees with the server on every Code connection, in both states', () => {
    for (const key of WORKSPACE_CODE_TOGGLE_KEYS) {
      for (const off of [false, true]) {
        const controls = { ...DEFAULT_WORKSPACE_CODE_CONTROLS, [key]: !off };
        expect({
          key,
          off,
          client: isWorkspaceCodeConnectionAllowed(codePolicy({ [key]: !off }), key),
        }).toEqual({
          key,
          off,
          client: evaluateWorkspaceCodeAct(controls, CODE_ACT_FOR[key]).allowed,
        });
      }
    }
  });

  it('treats a server that sends no Code controls as no rule at all', () => {
    for (const key of WORKSPACE_CODE_TOGGLE_KEYS) {
      expect(isWorkspaceCodeConnectionAllowed(codePolicy(null), key)).toBe(true);
    }
    expect(isWorkspaceCodeHostAllowed(codePolicy(null), 'anything.example.com')).toBe(true);
    expect(workspaceCodeSessionRetentionDays(codePolicy(null))).toBeNull();
  });

  it('agrees with the server on an egress host, and an empty list is no rule', () => {
    const scoped = codePolicy({ allowedEgressHosts: ['*.example.com'] });
    expect(isWorkspaceCodeHostAllowed(scoped, 'api.example.com')).toBe(true);
    expect(isWorkspaceCodeHostAllowed(scoped, 'evil.test')).toBe(false);
    expect(isWorkspaceCodeHostAllowed(codePolicy({ allowedEgressHosts: [] }), 'evil.test')).toBe(
      true,
    );
  });

  it('carries the shorter Code session retention the server resolved', () => {
    expect(workspaceCodeSessionRetentionDays(codePolicy({ sessionRetentionDays: 7 }))).toBe(7);
  });

  it('keeps a payload whose Code controls are malformed out of the snapshot', () => {
    const wire = {
      organizationId: ORGANIZATION_ID,
      governed: true,
      revision: REVISION,
      controls: controlsWith([]),
      code: { allowGithubConnection: 'no' },
    };

    expect(parseEffectiveWorkspacePolicy(wire)?.code).toBeNull();
  });
});
