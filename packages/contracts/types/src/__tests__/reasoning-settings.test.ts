import { describe, expect, it } from 'vitest';
import { listCanonicalModels, type ModelMetadata } from '../model-catalog';
import { resolveThinkingSendPolicy } from '../reasoning-settings';

function fixture(predicate: (model: ModelMetadata) => boolean): ModelMetadata {
  const model = listCanonicalModels().find(predicate);
  if (!model) throw new Error('The catalog has no model for this reasoning contract.');
  return model;
}

const disableable = fixture(
  (model) => model.reasoning?.supportedEfforts?.includes('none') === true,
);
const required = fixture(
  (model) =>
    model.reasoning?.canDisableThinking === false &&
    model.reasoning.control === 'effort_levels' &&
    (model.reasoning.supportedEfforts?.length ?? 0) > 1,
);

describe('effective reasoning settings', () => {
  it('turns a global Off preference into the provider-supported none value', () => {
    const policy = resolveThinkingSendPolicy({
      modelId: disableable.id,
      requestedThinking: false,
      requestedEffort: 'high',
    });
    expect(policy).toMatchObject({ thinkingEnabled: false, effort: 'none', offUnsupported: false });
  });

  it('uses the lowest supported value and reports that Off cannot be honored', () => {
    const preference = Object.freeze({ enabled: false, effort: 'high' });
    const policy = resolveThinkingSendPolicy({
      modelId: required.id,
      requestedThinking: preference.enabled,
      requestedEffort: preference.effort,
    });
    expect(policy).toMatchObject({
      thinkingEnabled: true,
      effort: required.reasoning?.supportedEfforts?.[0],
      offUnsupported: true,
      alwaysOn: true,
    });
    expect(preference).toEqual({ enabled: false, effort: 'high' });
  });

  it('recomputes from the unchanged preference when switching models', () => {
    const params = { requestedThinking: false, requestedEffort: 'max' };
    expect(resolveThinkingSendPolicy({ ...params, modelId: required.id }).offUnsupported).toBe(
      true,
    );
    expect(resolveThinkingSendPolicy({ ...params, modelId: disableable.id })).toMatchObject({
      thinkingEnabled: false,
      effort: 'none',
      offUnsupported: false,
    });
  });

  it('never sends stale reasoning to a non-reasoning model', () => {
    const model = fixture((candidate) => candidate.capabilities.thinking === false);
    expect(
      resolveThinkingSendPolicy({
        modelId: model.id,
        requestedThinking: true,
        requestedEffort: 'max',
      }),
    ).toMatchObject({ thinkingEnabled: undefined, effort: undefined, offUnsupported: false });
  });

  it('keeps every emitted effort within the declared provider request contract', () => {
    for (const model of listCanonicalModels()) {
      for (const enabled of [true, false]) {
        for (const effort of [
          'none',
          'minimal',
          'low',
          'medium',
          'high',
          'xhigh',
          'max',
          'invalid',
        ]) {
          const policy = resolveThinkingSendPolicy({
            modelId: model.id,
            requestedThinking: enabled,
            requestedEffort: effort,
          });
          if (policy.effort !== undefined) {
            expect(model.reasoning?.supportedEfforts, model.id).toContain(policy.effort);
            expect(
              Boolean(
                model.reasoning?.request?.effortPath ||
                model.reasoning?.request?.responsesEffortPath,
              ),
              model.id,
            ).toBe(true);
          }
          if (model.reasoning?.canDisableThinking === false && model.reasoning.capable) {
            expect(policy.thinkingEnabled, model.id).not.toBe(false);
          }
        }
      }
    }
  });
});
