import { describe, it, expect } from 'vitest';
import { listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';
import {
  anthropicUsesAdaptiveThinking,
  buildThinkingConfig,
  resolveRequestEffort,
} from './request-processor';

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

const EFFORT_LADDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const TIER_CLAMP_MODEL = requireModel(
  'reasoning model whose catalog ladder rises above its default effort',
  (model) => {
    const reasoning = model.reasoning;
    const request = reasoning?.request;
    if (!reasoning?.defaultEffort) return false;
    if (!request?.effortPath && !request?.responsesEffortPath) return false;
    if (model.provider === 'openai') return false;
    const defaultRank = EFFORT_LADDER.indexOf(reasoning.defaultEffort);
    return (reasoning.supportedEfforts ?? []).some(
      (effort) => EFFORT_LADDER.indexOf(effort) > defaultRank,
    );
  },
);
const TIER_CLAMP_DEFAULT_EFFORT = TIER_CLAMP_MODEL.reasoning!.defaultEffort!;
const TIER_CLAMP_TOP_EFFORT = [...(TIER_CLAMP_MODEL.reasoning!.supportedEfforts ?? [])].sort(
  (a, b) => EFFORT_LADDER.indexOf(a) - EFFORT_LADDER.indexOf(b),
)[(TIER_CLAMP_MODEL.reasoning!.supportedEfforts ?? []).length - 1]!;

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
    expect(resolveRequestEffort('openai', MAX_EFFORT_MODEL.id, 'max', 'pro')).toBe('max');
  });

  it('drops an effort for a model without a registry entry (fail closed)', () => {
    expect(
      resolveRequestEffort('openai', 'unregistered-openai-model', 'max', 'pro'),
    ).toBeUndefined();
  });

  it('does not attach reasoning effort to a catalog non-reasoning model', () => {
    expect(
      resolveRequestEffort(NON_REASONING_MODEL.provider, NON_REASONING_MODEL.id, 'high', 'pro'),
    ).toBeUndefined();
  });

  it('preserves provider-supported none and minimal effort values', () => {
    expect(
      resolveRequestEffort(NONE_EFFORT_MODEL.provider, NONE_EFFORT_MODEL.id, 'none', 'pro'),
    ).toBe('none');
    expect(
      resolveRequestEffort(
        MINIMAL_EFFORT_MODEL.provider,
        MINIMAL_EFFORT_MODEL.id,
        'minimal',
        'pro',
      ),
    ).toBe('minimal');
  });
});

describe('resolveRequestEffort (entitlement clamp)', () => {
  it('clamps a caller without manual model selection down to the model default', () => {
    expect(
      resolveRequestEffort(
        TIER_CLAMP_MODEL.provider,
        TIER_CLAMP_MODEL.id,
        TIER_CLAMP_TOP_EFFORT,
        'free',
      ),
    ).toBe(TIER_CLAMP_DEFAULT_EFFORT);
  });

  it('clamps an unknown or missing plan tier the same way as free', () => {
    expect(
      resolveRequestEffort(
        TIER_CLAMP_MODEL.provider,
        TIER_CLAMP_MODEL.id,
        TIER_CLAMP_TOP_EFFORT,
        null,
      ),
    ).toBe(TIER_CLAMP_DEFAULT_EFFORT);
  });

  it('leaves an entitled caller at the requested effort', () => {
    expect(
      resolveRequestEffort(
        TIER_CLAMP_MODEL.provider,
        TIER_CLAMP_MODEL.id,
        TIER_CLAMP_TOP_EFFORT,
        'pro',
      ),
    ).toBe(TIER_CLAMP_TOP_EFFORT);
  });

  it('never clamps an effort at or below the model default', () => {
    expect(
      resolveRequestEffort(
        TIER_CLAMP_MODEL.provider,
        TIER_CLAMP_MODEL.id,
        TIER_CLAMP_DEFAULT_EFFORT,
        'free',
      ),
    ).toBe(TIER_CLAMP_DEFAULT_EFFORT);
  });
});
