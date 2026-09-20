import { describe, expect, it } from 'vitest';

import {
  AUTHORIZATION_PRECEDENCE,
  AUTHORIZATION_STAGES,
  ENTERPRISE_DENIAL_CODES,
  ENTERPRISE_DENIAL_STAGE,
  evaluateAuthorization,
  type AuthorizationStage,
  type AuthorizationSubject,
  type EnterpriseDenialCode,
} from '../enterprise/authorization';
import {
  DEFAULT_WORKSPACE_CONTROLS,
  WORKSPACE_FEATURES,
  WORKSPACE_REASONING_EFFORTS,
} from '../enterprise/workspace-controls';

const FEATURE = WORKSPACE_FEATURES[0]!;

function subject(overrides: Partial<AuthorizationSubject> = {}): AuthorizationSubject {
  return {
    organizationId: 'org_stages',
    isMember: true,
    isPrimaryOwner: false,
    permissions: ['content.read'],
    entitledFeatures: null,
    controls: DEFAULT_WORKSPACE_CONTROLS,
    policyRevision: 3,
    ...overrides,
  };
}

function denialCodeOf(
  input: Parameters<typeof evaluateAuthorization>[0],
  ask: Parameters<typeof evaluateAuthorization>[1],
): EnterpriseDenialCode {
  const decision = evaluateAuthorization(input, ask);
  if (decision.allowed) throw new Error('expected a refusal');
  expect(decision.denial.stage).toBe(ENTERPRISE_DENIAL_STAGE[decision.denial.code]);
  return decision.denial.code;
}

describe('the five stages are separate answers, not one boolean', () => {
  it('gives every denial code exactly one stage, drawn from the stage list', () => {
    for (const code of ENTERPRISE_DENIAL_CODES) {
      const stage = ENTERPRISE_DENIAL_STAGE[code];
      expect(AUTHORIZATION_STAGES).toContain(stage);
    }
    expect(Object.keys(ENTERPRISE_DENIAL_STAGE).sort()).toEqual(
      [...ENTERPRISE_DENIAL_CODES].sort(),
    );
  });

  it('leaves no stage without a refusal that names it', () => {
    const named = new Set<AuthorizationStage>(
      ENTERPRISE_DENIAL_CODES.map((code) => ENTERPRISE_DENIAL_STAGE[code]),
    );
    expect([...named].sort()).toEqual([...AUTHORIZATION_STAGES].sort());
  });

  it('describes each stage once, in order, and only ever narrows', () => {
    expect(AUTHORIZATION_PRECEDENCE.map((entry) => entry.stage)).toEqual([...AUTHORIZATION_STAGES]);
    for (const entry of AUTHORIZATION_PRECEDENCE) {
      expect(entry.effectOnEarlierStages).toBe('narrow');
      expect(entry.question.length).toBeGreaterThan(10);
      expect(entry.source.length).toBeGreaterThan(0);
    }
  });

  it('refuses one feature four different ways, one per reason', () => {
    expect(denialCodeOf(subject({ isMember: false }), { feature: FEATURE })).toBe('not_a_member');
    expect(denialCodeOf(subject({ entitledFeatures: [] }), { feature: FEATURE })).toBe(
      'plan_does_not_include',
    );
    expect(
      denialCodeOf(
        subject({
          controls: {
            ...DEFAULT_WORKSPACE_CONTROLS,
            featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, [FEATURE]: false },
          },
        }),
        { feature: FEATURE },
      ),
    ).toBe('feature_disabled');
    expect(denialCodeOf(subject({ withheldByRollout: [FEATURE] }), { feature: FEATURE })).toBe(
      'rollout_withheld',
    );
  });

  it('separates a permission refusal from a policy refusal on the same ask', () => {
    expect(denialCodeOf(subject({ permissions: [] }), { permission: 'content.read' })).toBe(
      'permission_denied',
    );
    expect(denialCodeOf(subject(), { permission: 'workspace.delete' })).toBe('primary_owner_only');
    expect(
      denialCodeOf(
        subject({ controls: { ...DEFAULT_WORKSPACE_CONTROLS, allowedCountries: ['DE'] } }),
        {
          country: 'FR',
        },
      ),
    ).toBe('region_not_allowed');
    expect(
      denialCodeOf(
        subject({
          controls: {
            ...DEFAULT_WORKSPACE_CONTROLS,
            maxReasoningEffort: WORKSPACE_REASONING_EFFORTS[0],
          },
        }),
        { reasoningEffort: WORKSPACE_REASONING_EFFORTS[WORKSPACE_REASONING_EFFORTS.length - 1] },
      ),
    ).toBe('reasoning_effort_capped');
  });

  it('answers the earliest refusal when several would apply', () => {
    const blocked = subject({
      isMember: false,
      entitledFeatures: [],
      permissions: [],
      withheldByRollout: [FEATURE],
      controls: {
        ...DEFAULT_WORKSPACE_CONTROLS,
        featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, [FEATURE]: false },
      },
    });
    expect(denialCodeOf(blocked, { feature: FEATURE, permission: 'content.read' })).toBe(
      'not_a_member',
    );
  });
});
