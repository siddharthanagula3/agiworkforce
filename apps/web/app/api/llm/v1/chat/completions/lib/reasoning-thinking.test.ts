import { describe, it, expect } from 'vitest';
import { listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';
import {
  anthropicUsesAdaptiveThinking,
  buildThinkingConfig,
  resolveRequestEffort,
} from './request-processor';

/**
 * Reasoning-effort-capability wave (2026-07-10): the Anthropic thinking request
 * path is driven by per-model `reasoning.control`, NOT just capabilities.thinking.
 *   - Anthropic effort-level models → adaptive thinking; classic
 *     enabled+budget is not a valid request shape.
 *   - The classic `thinking_budget` path (enabled+budget, NOT adaptive) has no
 *     test here because the current catalog has no such model. The branch is
 *     retained for a future catalog entry that controls thinking by budget.
 * See docs/research/reasoning-effort-capability-matrix-2026-07-10.md flags 2 & 3.
 */
function requireModel(
  description: string,
  predicate: (model: ModelMetadata) => boolean,
): ModelMetadata {
  const model = listCanonicalModels().find(predicate);
  if (!model) throw new Error(`Catalog fixture missing: ${description}`);
  return model;
}

const ADAPTIVE_ANTHROPIC_MODELS = listCanonicalModels().filter(
  (model) => model.provider === 'anthropic' && model.reasoning?.control === 'effort_levels',
);
if (ADAPTIVE_ANTHROPIC_MODELS.length < 2) {
  throw new Error('At least two catalog-backed adaptive Anthropic fixtures are required');
}
const PRIMARY_ADAPTIVE_MODEL = ADAPTIVE_ANTHROPIC_MODELS.find(
  (model) =>
    model.reasoning?.canDisableThinking === true &&
    model.reasoning.maxEffortWhenThinkingDisabled === 'high',
);
if (!PRIMARY_ADAPTIVE_MODEL) {
  throw new Error(
    'A disableable adaptive Anthropic fixture with a high-effort ceiling is required',
  );
}
const SECONDARY_ADAPTIVE_MODEL = ADAPTIVE_ANTHROPIC_MODELS.find(
  (model) => model.id !== PRIMARY_ADAPTIVE_MODEL.id,
)!;
const MAX_EFFORT_MODEL = requireModel(
  'OpenAI model supporting max effort',
  (model) =>
    model.provider === 'openai' && model.reasoning?.supportedEfforts?.includes('max') === true,
);
const NON_REASONING_MODEL = requireModel(
  'non-reasoning model',
  (model) => model.reasoning?.capable !== true,
);
const NONE_EFFORT_MODEL = requireModel(
  'model supporting none effort',
  (model) => model.reasoning?.supportedEfforts?.includes('none') === true,
);
const MINIMAL_EFFORT_MODEL = requireModel(
  'model supporting minimal effort',
  (model) => model.reasoning?.supportedEfforts?.includes('minimal') === true,
);

describe('anthropicUsesAdaptiveThinking (control-driven)', () => {
  it('returns adaptive for the first catalog-backed effort-level model', () => {
    expect(anthropicUsesAdaptiveThinking(PRIMARY_ADAPTIVE_MODEL.id)).toBe(true);
  });

  it('returns adaptive for another catalog-backed effort-level model', () => {
    expect(anthropicUsesAdaptiveThinking(SECONDARY_ADAPTIVE_MODEL.id)).toBe(true);
  });
});

describe('buildThinkingConfig (Anthropic)', () => {
  it('sends adaptive thinking when an effort-level model is explicitly enabled', () => {
    const cfg = buildThinkingConfig({
      provider: 'anthropic',
      model: PRIMARY_ADAPTIVE_MODEL.id,
      explicitThinking: undefined,
      thinkingMode: true,
      effort: 'high',
    });
    expect(cfg).toEqual({ type: 'adaptive' });
  });

  it('sends an explicit disabled shape when the model toggle is off', () => {
    const cfg = buildThinkingConfig({
      provider: 'anthropic',
      model: PRIMARY_ADAPTIVE_MODEL.id,
      explicitThinking: undefined,
      thinkingMode: false,
      effort: 'high',
    });
    expect(cfg).toEqual({ type: 'disabled' });
  });

  it.each(['xhigh', 'max'] as const)(
    'rejects disabled adaptive thinking at %s effort before the provider call',
    (effort) => {
      expect(() =>
        buildThinkingConfig({
          provider: 'anthropic',
          model: PRIMARY_ADAPTIVE_MODEL.id,
          explicitThinking: undefined,
          thinkingMode: false,
          effort,
        }),
      ).toThrow(/thinking.*disabled.*high/i);
    },
  );

  it('preserves an explicit disabled block for an adaptive model', () => {
    const cfg = buildThinkingConfig({
      provider: 'anthropic',
      model: PRIMARY_ADAPTIVE_MODEL.id,
      explicitThinking: { type: 'disabled' },
      thinkingMode: true,
      effort: 'high',
    });
    expect(cfg).toEqual({ type: 'disabled' });
  });

  it('rewrites an explicit classic thinking block to adaptive', () => {
    const cfg = buildThinkingConfig({
      provider: 'anthropic',
      model: PRIMARY_ADAPTIVE_MODEL.id,
      explicitThinking: { type: 'enabled', budget_tokens: 8192 },
      thinkingMode: true,
      effort: 'high',
    });
    expect(cfg).toEqual({ type: 'adaptive' });
  });

  it('returns undefined for a non-Anthropic provider', () => {
    expect(
      buildThinkingConfig({
        provider: 'openai',
        model: MAX_EFFORT_MODEL.id,
        explicitThinking: undefined,
        thinkingMode: true,
        effort: 'high',
      }),
    ).toBeUndefined();
  });
});

describe('resolveRequestEffort (catalog-driven)', () => {
  it('preserves max for an OpenAI model whose registry entry supports it', () => {
    expect(resolveRequestEffort('openai', MAX_EFFORT_MODEL.id, 'max')).toBe('max');
  });

  it('drops an effort for a model without a registry entry (fail closed)', () => {
    expect(resolveRequestEffort('openai', 'unregistered-openai-model', 'max')).toBeUndefined();
  });

  it('does not attach reasoning effort to a catalog non-reasoning model', () => {
    expect(
      resolveRequestEffort(NON_REASONING_MODEL.provider, NON_REASONING_MODEL.id, 'high'),
    ).toBeUndefined();
  });

  it('preserves provider-supported none and minimal effort values', () => {
    expect(resolveRequestEffort(NONE_EFFORT_MODEL.provider, NONE_EFFORT_MODEL.id, 'none')).toBe(
      'none',
    );
    expect(
      resolveRequestEffort(MINIMAL_EFFORT_MODEL.provider, MINIMAL_EFFORT_MODEL.id, 'minimal'),
    ).toBe('minimal');
  });
});
