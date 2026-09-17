import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROLLOUT_EVALUATION_CONFIG,
  detectRolloutAlerts,
  resolveRolloutEvaluationConfig,
  type CohortMetrics,
} from '../rollout-evaluation-service';

const SLOT = 'coding_balanced';

function metrics(overrides: Partial<CohortMetrics>): CohortMetrics {
  return {
    slotId: SLOT,
    cohort: 'control',
    modelKey: 'promoted-model',
    lifecycleStage: 'promoted',
    samples: 100,
    failureRate: 0.01,
    latencyP50Ms: 800,
    latencyP95Ms: 1600,
    costPerRequestMicrousd: 1_000,
    ...overrides,
  };
}

const CONFIG = DEFAULT_ROLLOUT_EVALUATION_CONFIG;

describe('rollout cohort alerts', () => {
  it('stays silent while the canary matches the promoted model', () => {
    expect(
      detectRolloutAlerts(
        [metrics({}), metrics({ cohort: 'canary', modelKey: 'candidate-model' })],
        CONFIG,
      ),
    ).toEqual([]);
  });

  it('pages on quality, latency and cost regressions, each in its own alert', () => {
    const alerts = detectRolloutAlerts(
      [
        metrics({}),
        metrics({
          cohort: 'canary',
          modelKey: 'candidate-model',
          failureRate: 0.2,
          latencyP50Ms: 2_400,
          costPerRequestMicrousd: 4_000,
        }),
      ],
      CONFIG,
    );
    expect(alerts.map((alert) => alert.kind).sort()).toEqual(['cost', 'latency', 'quality']);
    expect(alerts[0]).toMatchObject({
      slotId: SLOT,
      cohort: 'canary',
      candidateModelKey: 'candidate-model',
      controlModelKey: 'promoted-model',
    });
  });

  it('judges a shadow cohort against the model it would replace', () => {
    const alerts = detectRolloutAlerts(
      [metrics({}), metrics({ cohort: 'shadow', modelKey: 'shadow-model', failureRate: 0.5 })],
      CONFIG,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'quality', cohort: 'shadow' });
  });

  it('waits for enough requests on both sides before judging anything', () => {
    const alerts = detectRolloutAlerts(
      [
        metrics({ samples: 3 }),
        metrics({ cohort: 'canary', modelKey: 'candidate-model', failureRate: 1, samples: 3 }),
      ],
      CONFIG,
    );
    expect(alerts).toEqual([]);
  });

  it('never judges a cohort with no promoted model in the same window', () => {
    expect(detectRolloutAlerts([metrics({ cohort: 'canary', failureRate: 1 })], CONFIG)).toEqual(
      [],
    );
  });

  it('treats a slow window for everyone as no regression', () => {
    const alerts = detectRolloutAlerts(
      [
        metrics({ latencyP50Ms: 9_000 }),
        metrics({ cohort: 'canary', modelKey: 'candidate-model', latencyP50Ms: 9_500 }),
      ],
      CONFIG,
    );
    expect(alerts).toEqual([]);
  });
});

describe('rollout evaluation config', () => {
  it('keeps the default when a value is unparseable or absent', () => {
    expect(
      resolveRolloutEvaluationConfig({
        AGI_ROLLOUT_MIN_SAMPLES: 'many',
        AGI_ROLLOUT_COST_RATIO: '',
      }),
    ).toEqual(DEFAULT_ROLLOUT_EVALUATION_CONFIG);
  });

  it('reads an operator override', () => {
    expect(resolveRolloutEvaluationConfig({ AGI_ROLLOUT_LATENCY_RATIO: '2' }).latencyRatio).toBe(2);
  });
});
