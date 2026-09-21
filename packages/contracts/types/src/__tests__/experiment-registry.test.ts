import { describe, expect, it } from 'vitest';

import { PRODUCT_DOMAINS } from '../domain-registry';
import {
  EXPERIMENT_ASSIGNMENT_KEYS,
  EXPERIMENT_CONTROL_VARIANT,
  EXPERIMENT_DECISIONS,
  EXPERIMENT_FORBIDDEN_DOMAINS,
  EXPERIMENT_IDS,
  EXPERIMENT_RESULTS,
  experimentAssignment,
  experimentBlockers,
  experimentExposure,
  type ExperimentDefinition,
} from '../experiment-registry';
import { FEATURE_MATURITIES } from '../model-catalog';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const DAY = 86_400_000;

const RUNNING: ExperimentDefinition = {
  hypothesis: 'A shorter composer hint raises the share of first messages that are sent.',
  owner: 'apps/web/features/chat/components/Composer',
  domain: 'chat',
  policy: 'work',
  population: 'Signed-in accounts on the web surface in their first session.',
  exclusions: ['enterprise workspaces'],
  variants: [EXPERIMENT_CONTROL_VARIANT, 'short_hint'],
  assignmentKey: 'user',
  exposureEvent: 'composer.hint_seen',
  primaryMetric: 'first message sent within the session',
  guardrails: ['message send errors'],
  startAt: new Date(NOW - DAY).toISOString(),
  endAt: new Date(NOW + DAY).toISOString(),
  result: 'pending',
  decision: 'pending',
};

describe('the experiment registry', () => {
  it('declares no experiment today, so nothing is running unannounced', () => {
    expect(EXPERIMENT_IDS).toEqual([]);
  });

  it('refuses the subjects an experiment may never vary', () => {
    for (const domain of EXPERIMENT_FORBIDDEN_DOMAINS) {
      expect(PRODUCT_DOMAINS).toContain(domain);
    }
    for (const domain of ['billing', 'entitlements', 'safety'] as const) {
      expect(EXPERIMENT_FORBIDDEN_DOMAINS).toContain(domain);
    }
  });

  it('buckets only by subjects the flag evaluator can bucket', () => {
    expect([...EXPERIMENT_ASSIGNMENT_KEYS]).toEqual(['user', 'workspace']);
  });

  it('keeps a result and a decision apart: a number is not a choice', () => {
    expect(EXPERIMENT_RESULTS).toContain('inconclusive');
    expect(EXPERIMENT_DECISIONS).toContain('ship');
    expect(EXPERIMENT_DECISIONS).toContain('revert');
    const decisions: readonly string[] = EXPERIMENT_DECISIONS;
    expect(EXPERIMENT_RESULTS.filter((result) => decisions.includes(result))).toEqual(['pending']);
  });

  it('states maturity in the shared vocabulary rather than an experiment one', () => {
    expect(FEATURE_MATURITIES).toContain('general_availability');
  });
});

describe('assignment and exposure', () => {
  it('reads the arm from the one flag that carries the split', () => {
    expect(experimentAssignment('composer_hint', RUNNING, 'short_hint')).toEqual({
      experiment: 'composer_hint',
      variant: 'short_hint',
      control: false,
    });
  });

  it('puts a subject on an arm the registry does not declare back on control', () => {
    for (const variant of ['off', 'mystery_arm', null, undefined]) {
      expect(experimentAssignment('composer_hint', RUNNING, variant)).toMatchObject({
        variant: EXPERIMENT_CONTROL_VARIANT,
        control: true,
      });
    }
  });

  it('does not expose anybody by assigning them', () => {
    const assignment = experimentAssignment('composer_hint', RUNNING, 'short_hint');
    expect(assignment).not.toHaveProperty('event');
    expect(experimentExposure(assignment, RUNNING)).toEqual({
      event: 'composer.hint_seen',
      experiment: 'composer_hint',
      variant: 'short_hint',
    });
  });
});

describe('when an experiment may not run', () => {
  it('does not run where the administrator turned the feature off', () => {
    expect(
      experimentBlockers('composer_hint', RUNNING, { policyAllows: true, nowMs: NOW }),
    ).toEqual([]);
    expect(
      experimentBlockers('composer_hint', RUNNING, { policyAllows: false, nowMs: NOW }),
    ).toEqual([
      'composer_hint varies work, which this workspace has turned off, so it does not run here',
    ]);
  });

  it('ignores the workspace control when it varies nothing an administrator governs', () => {
    expect(
      experimentBlockers(
        'composer_hint',
        { ...RUNNING, policy: null },
        { policyAllows: false, nowMs: NOW },
      ),
    ).toEqual([]);
  });

  it('assigns nobody before it starts or after it ends', () => {
    expect(
      experimentBlockers('composer_hint', RUNNING, { policyAllows: true, nowMs: NOW - 2 * DAY }),
    ).toHaveLength(1);
    expect(
      experimentBlockers('composer_hint', RUNNING, { policyAllows: true, nowMs: NOW + 2 * DAY }),
    ).toEqual(['composer_hint ended on ' + RUNNING.endAt + ' and assigns nobody']);
  });
});
