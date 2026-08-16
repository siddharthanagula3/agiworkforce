import { describe, expect, it } from 'vitest';
import { getModelReasoning, listCanonicalModels } from '@agiworkforce/types';
import {
  isAlwaysOnReasoningModel,
  resolveThinkingSendPolicy,
  showsThinkingSwitch,
} from '../thinkingPolicy';

function firstModelIdWhere(predicate: (id: string) => boolean): string {
  const match = listCanonicalModels().find((model) => predicate(model.id));
  if (!match) throw new Error('No catalog model matches this reasoning shape');
  return match.id;
}

const alwaysOnModelId = firstModelIdWhere(
  (id) => getModelReasoning(id).canDisableThinking === false,
);
const effortCapModelId = firstModelIdWhere((id) =>
  Boolean(getModelReasoning(id).maxEffortWhenThinkingDisabled),
);
const noReasoningModelId = firstModelIdWhere((id) => {
  const reasoning = getModelReasoning(id);
  return reasoning.control === 'none' && reasoning.capable === false;
});

describe('resolveThinkingSendPolicy', () => {
  it('forces thinking on for a model whose catalog entry cannot disable it', () => {
    const policy = resolveThinkingSendPolicy({
      modelId: alwaysOnModelId,
      requestedThinking: false,
    });

    expect(policy.thinkingEnabled).toBe(true);
    expect(policy.alwaysOn).toBe(true);
    expect(policy.showsSwitch).toBe(false);
  });

  it('omits thinking_mode entirely for a model that declares no thinking contract', () => {
    const policy = resolveThinkingSendPolicy({
      modelId: noReasoningModelId,
      requestedThinking: false,
    });

    expect(policy.thinkingEnabled).toBeUndefined();
    expect(policy.effort).toBeUndefined();
  });

  it('clamps effort to maxEffortWhenThinkingDisabled when thinking is off', () => {
    const reasoning = getModelReasoning(effortCapModelId);
    const cap = reasoning.maxEffortWhenThinkingDisabled;
    const supportedEfforts = reasoning.supportedEfforts ?? [];
    const above = supportedEfforts[supportedEfforts.length - 1];
    expect(cap).toBeTruthy();
    expect(above).toBeTruthy();
    expect(above).not.toBe(cap);

    const policy = resolveThinkingSendPolicy({
      modelId: effortCapModelId,
      requestedThinking: false,
      requestedEffort: above,
    });

    expect(policy.thinkingEnabled).toBe(false);
    expect(policy.effort).toBe(cap);
    expect(policy.effortClamped).toBe(true);
  });

  it('leaves the requested effort alone when thinking is on', () => {
    const reasoning = getModelReasoning(effortCapModelId);
    const supportedEfforts = reasoning.supportedEfforts ?? [];
    const above = supportedEfforts[supportedEfforts.length - 1];

    const policy = resolveThinkingSendPolicy({
      modelId: effortCapModelId,
      requestedThinking: true,
      requestedEffort: above,
    });

    expect(policy.thinkingEnabled).toBe(true);
    expect(policy.effort).toBe(above);
    expect(policy.effortClamped).toBe(false);
  });

  it('preserves the caller request for a model that is not in the static catalog', () => {
    const policy = resolveThinkingSendPolicy({
      modelId: 'fixture-dynamic-provider-model',
      requestedThinking: false,
      requestedEffort: 'max',
    });

    expect(policy.thinkingEnabled).toBe(false);
    expect(policy.effort).toBe('max');
    expect(policy.alwaysOn).toBe(false);
  });

  it('never emits an effort the selected model does not declare', () => {
    const policy = resolveThinkingSendPolicy({
      modelId: effortCapModelId,
      requestedThinking: true,
      requestedEffort: 'not-a-real-effort',
    });

    const supported = getModelReasoning(effortCapModelId).supportedEfforts ?? [];
    expect(policy.effort).toBeDefined();
    expect(supported).toContain(policy.effort);
  });
});

describe('composer visibility helpers', () => {
  it('hides the on/off switch for every always-on reasoner in the catalog', () => {
    const alwaysOn = listCanonicalModels()
      .map((model) => model.id)
      .filter((id) => isAlwaysOnReasoningModel(getModelReasoning(id)));

    expect(alwaysOn.length).toBeGreaterThan(0);
    for (const id of alwaysOn) {
      expect(showsThinkingSwitch(getModelReasoning(id))).toBe(false);
    }
  });

  it('hides the switch for a non-reasoning model', () => {
    expect(showsThinkingSwitch(getModelReasoning(noReasoningModelId))).toBe(false);
  });
});
