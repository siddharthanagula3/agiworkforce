import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_CONTROLS,
  evaluateAuthorization,
  WORKSPACE_FEATURES,
  type AuthorizationSubject,
  type EffectiveWorkspacePolicyResponse,
  type WorkspaceControls,
  type WorkspaceFeature,
} from '@agiworkforce/types';

import { disabledWorkspaceFeatures, isWorkspaceFeatureEnabled } from '../workspacePolicy';

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
