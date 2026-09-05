import { describe, expect, it, vi } from 'vitest';

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  const fixture = {
    id: 'fixture-disjoint-tiered-pricing',
    provider: 'anthropic',
    inputCost: 1,
    outputCost: 4,
    cached_input: 0.1,
    cached_write: 1.25,
    capabilities: { caching: true },
    inputTokenPricingTiers: [
      {
        thresholdTokens: 100_000,
        inputCost: 2,
        outputCost: 6,
        cached_input: 0.2,
        cached_write: 2.5,
      },
    ],
  };
  return {
    ...actual,
    getModelMetadataById: (id: string) =>
      id === fixture.id ? fixture : actual.getModelMetadataById(id),
  };
});

import { listCanonicalModels, resolveEffectiveModelPricing } from '@agiworkforce/types';

import { calculateCacheSavings, shouldEnablePromptCache } from './prompt-cache-helper';

const largeSystemRequest = {
  messages: [{ role: 'system', content: 'x'.repeat(5_000) }],
};

function requireCatalogFixture(
  predicate: (model: ReturnType<typeof listCanonicalModels>[number]) => boolean,
  description: string,
) {
  const model = listCanonicalModels().find(predicate);
  if (!model) throw new Error(`Canonical ${description} fixture is missing`);
  return model;
}

const CACHING_MODEL = requireCatalogFixture(
  (model) => model.capabilities.caching === true,
  'caching-model',
);
const ANTHROPIC_CACHING_MODEL = requireCatalogFixture(
  (model) =>
    model.provider === 'anthropic' &&
    model.capabilities.caching === true &&
    model.promptCacheMinimumTokens === 512,
  'Anthropic provider-minimum caching model',
);
const CACHE_PRICED_MODEL = requireCatalogFixture(
  (model) =>
    typeof model.inputCost === 'number' &&
    typeof model.cached_input === 'number' &&
    typeof model.cached_write === 'number',
  'cache-priced model',
);
const DEEPLY_DISCOUNTED_CACHE_MODEL = requireCatalogFixture(
  (model) =>
    typeof model.inputCost === 'number' &&
    typeof model.cached_input === 'number' &&
    model.cached_input < model.inputCost * 0.1,
  'deeply discounted cache-read model',
);
const FULL_RATE_CACHE_MODEL = requireCatalogFixture(
  (model) =>
    model.capabilities.caching === true &&
    typeof model.inputCost === 'number' &&
    model.cached_input === undefined,
  'full-rate cache-read model',
);

describe('shouldEnablePromptCache model ownership', () => {
  it('uses canonical catalog capability metadata for a known caching model', () => {
    expect(shouldEnablePromptCache(largeSystemRequest, CACHING_MODEL.id)).toBe(true);
  });

  it('does not infer caching from the name of an unregistered model', () => {
    expect(shouldEnablePromptCache(largeSystemRequest, 'fixture-unknown-one')).toBe(false);
    expect(shouldEnablePromptCache(largeSystemRequest, 'fixture-unknown-two')).toBe(false);
  });

  it('uses the catalog provider minimum of 512 tokens', () => {
    const exactly512Tokens = {
      messages: [{ role: 'system', content: 'x'.repeat(512 * 4) }],
    };

    expect(shouldEnablePromptCache(exactly512Tokens, ANTHROPIC_CACHING_MODEL.id)).toBe(true);
  });
});

describe('calculateCacheSavings cache-write reporting', () => {
  const response = {
    model: CACHE_PRICED_MODEL.id,
    cachedInputTokens: 1_000_000,
    cacheCreationInputTokens: 1_000_000,
  };

  it('reports the caller-resolved write price rather than a fixed surcharge', () => {
    const metrics = calculateCacheSavings(
      response,
      CACHE_PRICED_MODEL.inputCost!,
      CACHE_PRICED_MODEL.cached_write,
    );
    expect(metrics.cacheWriteCostCents).toBe(Math.round(CACHE_PRICED_MODEL.cached_write! * 100));
    expect(metrics.savedCostCents).toBe(
      Math.round((CACHE_PRICED_MODEL.inputCost! - CACHE_PRICED_MODEL.cached_input!) * 100),
    );
    expect(metrics.tokensSavedByCache).toBe(1_000_000);
  });

  it('reports a free write as the plain input cost when no write price is declared', () => {
    const { model: _model, ...withoutModel } = response;
    expect(calculateCacheSavings(withoutModel, 0.75, 0.75).cacheWriteCostCents).toBe(75);
  });

  it('keeps the Anthropic 1.25x surcharge for callers with no model context', () => {
    const { model: _model, ...withoutModel } = response;
    expect(calculateCacheSavings(withoutModel, 3).cacheWriteCostCents).toBe(375);
  });

  it('reports no read saving when the caller supplies no model', () => {
    const { model: _model, ...withoutModel } = response;
    expect(calculateCacheSavings(withoutModel, 3).savedCostCents).toBe(0);
  });
});

describe('calculateCacheSavings cache-read savings', () => {
  it('selects the cache-read tier from total disjoint input', () => {
    const model = 'fixture-disjoint-tiered-pricing';
    const pricedAt = new Date('2030-01-01T00:00:00Z');
    const atThreshold = calculateCacheSavings(
      {
        model,
        promptTokens: 60_000,
        cachedInputTokens: 25_000,
        cacheCreationInputTokens: 15_000,
      },
      1,
      1.25,
      pricedAt,
    );
    const aboveThreshold = calculateCacheSavings(
      {
        model,
        promptTokens: 60_000,
        cachedInputTokens: 25_000,
        cacheCreationInputTokens: 15_001,
      },
      2,
      2.5,
      pricedAt,
    );

    expect(atThreshold.savedCostCents).toBe(2);
    expect(aboveThreshold.savedCostCents).toBe(5);
  });

  it('uses the generated catalog input-length cache-read tier', () => {
    const model = listCanonicalModels().find(
      (candidate) =>
        (candidate.inputTokenPricingTiers?.length ?? 0) >= 1 &&
        typeof candidate.cached_input === 'number' &&
        candidate.inputTokenPricingTiers!.every(
          (tier) => typeof tier.cached_input === 'number' && typeof tier.cached_write === 'number',
        ),
    );
    if (!model?.inputTokenPricingTiers) {
      throw new Error('Canonical multi-band cache fixture is missing');
    }
    const tier = model.inputTokenPricingTiers[0]!;
    const threshold = tier.thresholdTokens;
    const base = resolveEffectiveModelPricing(model, new Date('2030-01-01T00:00:00Z'));

    const atThreshold = calculateCacheSavings(
      {
        model: model.id,
        promptTokens: threshold,
        cachedInputTokens: threshold,
      },
      base.inputCost,
      base.cached_write,
      new Date('2030-01-01T00:00:00Z'),
    );
    const aboveThreshold = calculateCacheSavings(
      {
        model: model.id,
        promptTokens: threshold + 1,
        cachedInputTokens: threshold + 1,
      },
      tier.inputCost,
      tier.cached_write,
      new Date('2030-01-01T00:00:00Z'),
    );

    expect(atThreshold.savedCostCents).toBe(
      Math.round((threshold * (base.inputCost - base.cached_input!)) / 10_000),
    );
    expect(aboveThreshold.savedCostCents).toBe(
      Math.round(((threshold + 1) * (tier.inputCost - tier.cached_input!)) / 10_000),
    );
  });

  it("reports the model's published read discount, not a flat 10%", () => {
    const metrics = calculateCacheSavings(
      { model: DEEPLY_DISCOUNTED_CACHE_MODEL.id, cachedInputTokens: 1_000_000 },
      DEEPLY_DISCOUNTED_CACHE_MODEL.inputCost!,
    );
    expect(metrics.savedCostCents).toBe(
      Math.round(
        (DEEPLY_DISCOUNTED_CACHE_MODEL.inputCost! - DEEPLY_DISCOUNTED_CACHE_MODEL.cached_input!) *
          100,
      ),
    );
  });

  it('reports no saving for a caching model that publishes no read price', () => {
    const metrics = calculateCacheSavings(
      { model: FULL_RATE_CACHE_MODEL.id, cachedInputTokens: 1_000_000 },
      FULL_RATE_CACHE_MODEL.inputCost!,
    );
    expect(metrics.savedCostCents).toBe(0);
  });
});
