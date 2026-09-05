import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  listCanonicalModels,
  requireProviderDefaultModel,
  resolveEffectiveModelPricing,
} from '@agiworkforce/types';
import { getRoutePricingForModel } from '@agiworkforce/model-registry';

import {
  LLMCostCalculator,
  isCacheTokensDisjointFromInput,
  setRouteRegistryPricingLookup,
} from '../llm-cost-calculator';

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  const fixture = {
    id: 'fixture-scheduled-model',
    provider: 'anthropic',
    inputCost: 3,
    outputCost: 15,
    cached_input: 0.3,
    cached_write: 3.75,
    cached_write_1h: 6,
    pricingSchedule: [
      {
        effectiveUntil: '2030-03-31',
        inputCost: 2,
        outputCost: 10,
        cached_input: 0.2,
        cached_write: 2.5,
        cached_write_1h: 4,
      },
      { effectiveFrom: '2030-04-01' },
    ],
  };
  const noWriteFixture = {
    id: 'fixture-no-cache-write',
    provider: 'openai',
    inputCost: 0.75,
    outputCost: 4.5,
    cached_input: 0.075,
  };
  const tieredFixture = {
    id: 'fixture-tiered-pricing',
    provider: 'openai',
    inputCost: 1,
    outputCost: 4,
    cached_input: 0.1,
    cached_write: 1.25,
    inputTokenPricingTiers: [
      {
        thresholdTokens: 100_000,
        inputCost: 2,
        outputCost: 6,
        cached_input: 0.2,
        cached_write: 2.5,
      },
      {
        thresholdTokens: 200_000,
        inputCost: 3,
        outputCost: 8,
        cached_input: 0.3,
        cached_write: 3.75,
      },
    ],
  };
  const disjointTieredFixture = {
    id: 'fixture-disjoint-tiered-pricing',
    provider: 'anthropic',
    inputCost: 1,
    outputCost: 4,
    cached_input: 0.1,
    cached_write: 1.25,
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
  const stableAnthropicFixture = {
    id: 'fixture-anthropic-standard',
    provider: 'anthropic',
    inputCost: 3,
    outputCost: 15,
    cached_input: 0.3,
    cached_write: 3.75,
    cached_write_1h: 6,
  };
  const premiumAnthropicFixture = {
    id: 'fixture-anthropic-premium',
    provider: 'anthropic',
    inputCost: 5,
    outputCost: 25,
    cached_input: 0.5,
    cached_write: 6.25,
    cached_write_1h: 10,
  };
  const unpricedCacheFixture = {
    id: 'fixture-inclusive-unpriced-cache',
    provider: 'xai',
    inputCost: 2,
    outputCost: 10,
  };
  return {
    ...actual,
    getModelMetadataById: (id: string) =>
      id === fixture.id
        ? fixture
        : id === noWriteFixture.id
          ? noWriteFixture
          : id === tieredFixture.id
            ? tieredFixture
            : id === disjointTieredFixture.id
              ? disjointTieredFixture
              : id === stableAnthropicFixture.id
                ? stableAnthropicFixture
                : id === premiumAnthropicFixture.id
                  ? premiumAnthropicFixture
                  : id === unpricedCacheFixture.id
                    ? unpricedCacheFixture
                    : actual.getModelMetadataById(id),
  };
});

function requireCatalogMultiBandModel() {
  const model = listCanonicalModels().find(
    (candidate) =>
      (candidate.inputTokenPricingTiers?.length ?? 0) >= 1 &&
      typeof candidate.cached_input === 'number' &&
      typeof candidate.cached_write === 'number' &&
      candidate.inputTokenPricingTiers!.every(
        (tier) => typeof tier.cached_input === 'number' && typeof tier.cached_write === 'number',
      ),
  );
  if (!model?.inputTokenPricingTiers) {
    throw new Error('Canonical multi-band billing fixture is missing');
  }
  return model;
}

describe('LLMCostCalculator, input-length pricing tiers', () => {
  const model = 'fixture-tiered-pricing';
  const date = new Date('2030-01-01T00:00:00Z');

  it('uses strict thresholds and the greatest qualifying tier', () => {
    expect(
      LLMCostCalculator.calculateCost(
        'openai',
        model,
        { promptTokens: 100_000, completionTokens: 100_000, totalTokens: 200_000 },
        date,
      ),
    ).toBe(50);
    expect(
      LLMCostCalculator.calculateCost(
        'openai',
        model,
        { promptTokens: 100_001, completionTokens: 100_000, totalTokens: 200_001 },
        date,
      ),
    ).toBe(81);
    expect(
      LLMCostCalculator.calculateCost(
        'openai',
        model,
        { promptTokens: 200_001, completionTokens: 100_000, totalTokens: 300_001 },
        date,
      ),
    ).toBe(141);
  });

  it('reads every ordered band and rate from the generated catalog', () => {
    const candidate = requireCatalogMultiBandModel();
    const tiers = candidate.inputTokenPricingTiers!;
    const base = resolveEffectiveModelPricing(candidate, date);

    tiers.forEach((tier, index) => {
      const preceding = index === 0 ? base : tiers[index - 1]!;
      expect(
        LLMCostCalculator.getPricing(candidate.provider, candidate.id, date, tier.thresholdTokens),
      ).toEqual(
        expect.objectContaining({
          inputCostPer1MTokens: preceding.inputCost,
          outputCostPer1MTokens: preceding.outputCost,
          cachedInputCostPer1MTokens: preceding.cached_input,
          cachedWriteCostPer1MTokens: preceding.cached_write,
        }),
      );
      expect(
        LLMCostCalculator.getPricing(
          candidate.provider,
          candidate.id,
          date,
          tier.thresholdTokens + 1,
        ),
      ).toEqual(
        expect.objectContaining({
          inputCostPer1MTokens: tier.inputCost,
          outputCostPer1MTokens: tier.outputCost,
          cachedInputCostPer1MTokens: tier.cached_input,
          cachedWriteCostPer1MTokens: tier.cached_write,
        }),
      );
    });
  });

  it('selects the tier from total disjoint input, including cache reads and writes', () => {
    const disjointModel = 'fixture-disjoint-tiered-pricing';
    const atThreshold = {
      promptTokens: 60_000,
      completionTokens: 0,
      totalTokens: 100_000,
      cacheReadInputTokens: 25_000,
      cacheCreationInputTokens: 15_000,
    };
    const aboveThreshold = {
      ...atThreshold,
      totalTokens: 100_001,
      cacheCreationInputTokens: 15_001,
    };

    expect(LLMCostCalculator.calculateCost('anthropic', disjointModel, atThreshold, date)).toBe(9);
    expect(LLMCostCalculator.calculateCost('anthropic', disjointModel, aboveThreshold, date)).toBe(
      17,
    );
  });
});

const STABLE_ANTHROPIC_MODEL = 'fixture-anthropic-standard';

describe('LLMCostCalculator, stable unscheduled pricing', () => {
  const PIN_DATES = [
    new Date('2020-01-01T00:00:00.000Z'),
    new Date('2026-08-15T00:00:00.000Z'),
    new Date('2026-09-15T00:00:00.000Z'),
  ];

  it('does not apply date-dependent promotional pricing', () => {
    for (const date of PIN_DATES) {
      const pricing = LLMCostCalculator.getPricing('anthropic', STABLE_ANTHROPIC_MODEL, date);
      expect(pricing.inputCostPer1MTokens).toBe(3);
      expect(pricing.outputCostPer1MTokens).toBe(15);
      expect(pricing.cachedInputCostPer1MTokens).toBe(0.3);
      expect(pricing.cachedWriteCostPer1MTokens).toBe(3.75);
      expect(pricing.cachedWrite1hCostPer1MTokens).toBe(6);
      expect(pricing).toEqual(
        LLMCostCalculator.getPricing('anthropic', STABLE_ANTHROPIC_MODEL, PIN_DATES[0]),
      );
    }
  });

  it('bills a mixed input/output/cache-read/cache-write request identically on every date', () => {
    const usage = {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    };

    for (const date of PIN_DATES) {
      expect(
        LLMCostCalculator.calculateCost('anthropic', STABLE_ANTHROPIC_MODEL, usage, date),
      ).toBe(2205);
    }
  });

  it('bills the 1h cache-write tier at the standard $6/M on every date', () => {
    const usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheCreationInputTokens: 1_000_000,
      cacheCreation1hInputTokens: 1_000_000,
    };
    for (const date of PIN_DATES) {
      expect(
        LLMCostCalculator.calculateCost('anthropic', STABLE_ANTHROPIC_MODEL, usage, date),
      ).toBe(600);
    }
  });

  it('estimateCost and getInputCostPerMtok use the same standard rate on every date', () => {
    for (const date of PIN_DATES) {
      expect(LLMCostCalculator.getInputCostPerMtok('anthropic', STABLE_ANTHROPIC_MODEL, date)).toBe(
        3,
      );
      expect(
        LLMCostCalculator.estimateCost('anthropic', STABLE_ANTHROPIC_MODEL, 1_000_000, 0, date),
      ).toBe(300);
    }
  });

  it('charges at least one ledger cent for non-empty paid usage while preserving free precision', () => {
    const usage = { promptTokens: 100, completionTokens: 0, totalTokens: 100 };
    const date = new Date('2026-09-15T00:00:00.000Z');

    expect(LLMCostCalculator.calculateCost('anthropic', STABLE_ANTHROPIC_MODEL, usage, date)).toBe(
      1,
    );
    expect(
      LLMCostCalculator.calculateCostMicrousd('anthropic', STABLE_ANTHROPIC_MODEL, usage, date),
    ).toBe(300);
  });

  it('does not charge a paid request with no observed usage', () => {
    expect(
      LLMCostCalculator.calculateCost(
        'anthropic',
        STABLE_ANTHROPIC_MODEL,
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        new Date('2026-09-15T00:00:00.000Z'),
      ),
    ).toBe(0);
  });
});

describe('LLMCostCalculator, dated pricing mechanism (synthetic fixture)', () => {
  const SCHEDULED_MODEL = 'fixture-scheduled-model';
  const INSIDE_FIRST_WINDOW = new Date('2030-02-15T00:00:00.000Z');
  const LAST_DAY_OF_FIRST_WINDOW = new Date('2030-03-31T23:59:59.999Z');
  const FIRST_DAY_OF_SECOND_WINDOW = new Date('2030-04-01T00:00:00.000Z');

  it('uses the covering window for every rate field, not just input and output', () => {
    const pricing = LLMCostCalculator.getPricing('anthropic', SCHEDULED_MODEL, INSIDE_FIRST_WINDOW);
    expect(pricing.inputCostPer1MTokens).toBe(2);
    expect(pricing.outputCostPer1MTokens).toBe(10);
    expect(pricing.cachedInputCostPer1MTokens).toBe(0.2);
    expect(pricing.cachedWriteCostPer1MTokens).toBe(2.5);
    expect(pricing.cachedWrite1hCostPer1MTokens).toBe(4);
  });

  it('treats effectiveUntil as inclusive and switches on the next UTC day', () => {
    expect(
      LLMCostCalculator.getPricing('anthropic', SCHEDULED_MODEL, LAST_DAY_OF_FIRST_WINDOW)
        .inputCostPer1MTokens,
    ).toBe(2);
    expect(
      LLMCostCalculator.getPricing('anthropic', SCHEDULED_MODEL, FIRST_DAY_OF_SECOND_WINDOW)
        .inputCostPer1MTokens,
    ).toBe(3);
  });

  it('falls back to the top-level rates for fields the covering window omits', () => {
    const pricing = LLMCostCalculator.getPricing(
      'anthropic',
      SCHEDULED_MODEL,
      FIRST_DAY_OF_SECOND_WINDOW,
    );
    expect(pricing.outputCostPer1MTokens).toBe(15);
    expect(pricing.cachedInputCostPer1MTokens).toBe(0.3);
    expect(pricing.cachedWriteCostPer1MTokens).toBe(3.75);
    expect(pricing.cachedWrite1hCostPer1MTokens).toBe(6);
  });

  it('bills a mixed request at the rate window that covers the request date', () => {
    const usage = {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    };

    expect(
      LLMCostCalculator.calculateCost('anthropic', SCHEDULED_MODEL, usage, INSIDE_FIRST_WINDOW),
    ).toBe(1470);
    expect(
      LLMCostCalculator.calculateCost(
        'anthropic',
        SCHEDULED_MODEL,
        usage,
        FIRST_DAY_OF_SECOND_WINDOW,
      ),
    ).toBe(2205);
  });

  it('takes the 1h cache-write rate from the window, not from a fixed 2x multiplier', () => {
    const usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheCreationInputTokens: 1_000_000,
      cacheCreation1hInputTokens: 1_000_000,
    };

    expect(
      LLMCostCalculator.calculateCost('anthropic', SCHEDULED_MODEL, usage, INSIDE_FIRST_WINDOW),
    ).toBe(400);
    expect(
      LLMCostCalculator.calculateCost(
        'anthropic',
        SCHEDULED_MODEL,
        usage,
        FIRST_DAY_OF_SECOND_WINDOW,
      ),
    ).toBe(600);
  });

  it('prices a model without a schedule identically on any date', () => {
    const early = LLMCostCalculator.getPricing(
      'anthropic',
      'fixture-anthropic-premium',
      new Date('2020-01-01T00:00:00.000Z'),
    );
    const late = LLMCostCalculator.getPricing(
      'anthropic',
      'fixture-anthropic-premium',
      new Date('2099-12-31T00:00:00.000Z'),
    );
    expect(late).toEqual(early);
  });
});

describe('LLMCostCalculator, cache-write billing', () => {
  const PRICED_ON = new Date('2026-09-01T00:00:00.000Z');

  it('reads declared write prices from the selected input tier', () => {
    expect(
      LLMCostCalculator.getCacheWriteCostPerMtok('openai', 'fixture-tiered-pricing', PRICED_ON),
    ).toBe(1.25);
    expect(
      LLMCostCalculator.getCacheWriteCostPerMtok(
        'openai',
        'fixture-tiered-pricing',
        PRICED_ON,
        100_001,
      ),
    ).toBe(2.5);
  });

  it('falls back to the plain input rate, a free write, when none is declared', () => {
    const model = 'fixture-no-cache-write';
    const pricing = LLMCostCalculator.getPricing('openai', model, PRICED_ON);
    expect(pricing.cachedWriteCostPer1MTokens).toBeUndefined();
    expect(LLMCostCalculator.getCacheWriteCostPerMtok('openai', model, PRICED_ON)).toBe(
      pricing.inputCostPer1MTokens,
    );
  });

  it('bills an inclusive-prompt OpenAI request once per token, writes at the declared rate', () => {
    const cents = LLMCostCalculator.calculateCost(
      'openai',
      'fixture-tiered-pricing',
      {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cacheReadInputTokens: 400_000,
        cacheCreationInputTokens: 200_000,
      },
      PRICED_ON,
    );
    expect(cents).toBe(208);
  });

  it('adds nothing for a cache write when the model declares no write price', () => {
    const model = 'fixture-no-cache-write';
    const base = {
      promptTokens: 1_000_000,
      completionTokens: 0,
      totalTokens: 1_000_000,
    };
    const withWrites = LLMCostCalculator.calculateCost(
      'openai',
      model,
      { ...base, cacheCreationInputTokens: 1_000_000 },
      PRICED_ON,
    );
    const withoutWrites = LLMCostCalculator.calculateCost('openai', model, base, PRICED_ON);
    expect(withWrites).toBe(75);
    expect(withWrites).toBe(withoutWrites);
  });

  it('bills a cache READ at the full input rate when the catalog prices none', () => {
    const pricing = LLMCostCalculator.getPricing(
      'xai',
      'fixture-inclusive-unpriced-cache',
      PRICED_ON,
    );
    expect(typeof pricing.cachedInputCostPer1MTokens).not.toBe('number');

    const cents = LLMCostCalculator.calculateCost(
      'xai',
      'fixture-inclusive-unpriced-cache',
      {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cacheReadInputTokens: 1_000_000,
      },
      PRICED_ON,
    );
    expect(cents).toBe(200);
  });

  it('keeps Anthropic disjoint accounting distinct from OpenAI subset accounting', () => {
    expect(
      LLMCostCalculator.getPricing('anthropic', 'fixture-anthropic-premium', PRICED_ON)
        .cacheTokensDisjointFromInput,
    ).toBe(true);
    expect(
      LLMCostCalculator.getPricing('openai', 'fixture-tiered-pricing', PRICED_ON)
        .cacheTokensDisjointFromInput,
    ).toBe(false);

    const cents = LLMCostCalculator.calculateCost(
      'anthropic',
      'fixture-anthropic-premium',
      {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cacheReadInputTokens: 1_000_000,
        cacheCreationInputTokens: 1_000_000,
      },
      PRICED_ON,
    );
    expect(cents).toBe(1175);
  });
});

describe('LLMCostCalculator, route-aware pricing fallback tiers', () => {
  const PRICED_ON = new Date('2026-09-01T00:00:00.000Z');
  const ROUTE_ID = 'open_router/fixture-anthropic-standard';

  afterEach(() => {
    setRouteRegistryPricingLookup(null);
  });

  it('prices by routeId when the registry exposes route pricing, ahead of canonical model pricing', () => {
    setRouteRegistryPricingLookup({
      getRoutePricing: (routeId) =>
        routeId === ROUTE_ID
          ? {
              provider: 'open_router',
              isDefault: false,
              inputPerMillion: 1,
              outputPerMillion: 2,
              cacheReadPerMillion: 0.1,
              cacheWritePerMillion: 1.5,
              cacheWrite1hPerMillion: null,
            }
          : null,
    });

    const pricing = LLMCostCalculator.getPricing(
      'open_router',
      STABLE_ANTHROPIC_MODEL,
      PRICED_ON,
      0,
      ROUTE_ID,
    );

    expect(pricing).toEqual({
      inputCostPer1MTokens: 1,
      outputCostPer1MTokens: 2,
      cachedInputCostPer1MTokens: 0.1,
      cachedWriteCostPer1MTokens: 1.5,
      cachedWrite1hCostPer1MTokens: undefined,
      cacheTokensDisjointFromInput: false,
    });
  });

  it('falls back to provider-specific registry pricing when no route pricing matches', () => {
    setRouteRegistryPricingLookup({
      getRoutePricingForModel: (modelId) =>
        modelId === STABLE_ANTHROPIC_MODEL
          ? [
              {
                provider: 'open_router',
                isDefault: true,
                inputPerMillion: 2.5,
                outputPerMillion: 12,
                cacheReadPerMillion: null,
                cacheWritePerMillion: null,
                cacheWrite1hPerMillion: null,
              },
            ]
          : [],
    });

    const pricing = LLMCostCalculator.getPricing('open_router', STABLE_ANTHROPIC_MODEL, PRICED_ON);

    expect(pricing.inputCostPer1MTokens).toBe(2.5);
    expect(pricing.outputCostPer1MTokens).toBe(12);
  });

  it('falls back to canonical model pricing when the registry exposes neither lookup', () => {
    const pricing = LLMCostCalculator.getPricing(
      'open_router',
      STABLE_ANTHROPIC_MODEL,
      PRICED_ON,
      0,
      ROUTE_ID,
    );

    expect(pricing.inputCostPer1MTokens).toBe(3);
    expect(pricing.outputCostPer1MTokens).toBe(15);
  });

  it('falls back to canonical model pricing when a matched route sheet has no usable price', () => {
    setRouteRegistryPricingLookup({
      getRoutePricing: (routeId) =>
        routeId === ROUTE_ID
          ? {
              provider: 'open_router',
              isDefault: false,
              inputPerMillion: null,
              outputPerMillion: null,
              cacheReadPerMillion: null,
              cacheWritePerMillion: null,
              cacheWrite1hPerMillion: null,
            }
          : null,
    });

    const pricing = LLMCostCalculator.getPricing(
      'open_router',
      STABLE_ANTHROPIC_MODEL,
      PRICED_ON,
      0,
      ROUTE_ID,
    );

    expect(pricing.inputCostPer1MTokens).toBe(3);
    expect(pricing.outputCostPer1MTokens).toBe(15);
  });

  it('prices cache read and cache write tokens with the route rates, not the vendor list price', () => {
    setRouteRegistryPricingLookup({
      getRoutePricing: (routeId) =>
        routeId === ROUTE_ID
          ? {
              provider: 'anthropic',
              isDefault: false,
              inputPerMillion: 1,
              outputPerMillion: 5,
              cacheReadPerMillion: 0.05,
              cacheWritePerMillion: 2,
              cacheWrite1hPerMillion: null,
            }
          : null,
    });

    const cents = LLMCostCalculator.calculateCost(
      'open_router',
      STABLE_ANTHROPIC_MODEL,
      {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cacheReadInputTokens: 1_000_000,
        cacheCreationInputTokens: 1_000_000,
      },
      PRICED_ON,
      ROUTE_ID,
    );

    expect(cents).toBe(305);
  });

  it('ignores route pricing for a routeId the registry does not recognize', () => {
    setRouteRegistryPricingLookup({
      getRoutePricing: (routeId) =>
        routeId === ROUTE_ID
          ? {
              provider: 'open_router',
              isDefault: false,
              inputPerMillion: 1,
              outputPerMillion: 2,
              cacheReadPerMillion: null,
              cacheWritePerMillion: null,
              cacheWrite1hPerMillion: null,
            }
          : null,
    });

    const pricing = LLMCostCalculator.getPricing(
      'anthropic',
      STABLE_ANTHROPIC_MODEL,
      PRICED_ON,
      0,
      'anthropic/some-other-route',
    );

    expect(pricing.inputCostPer1MTokens).toBe(3);
    expect(pricing.outputCostPer1MTokens).toBe(15);
  });
});

describe('LLMCostCalculator, live registry wiring', () => {
  const PRICED_ON = new Date('2026-09-01T00:00:00.000Z');
  const LIVE_MODEL_ID = requireProviderDefaultModel('anthropic');
  const LIVE_ROUTE_ID = getRoutePricingForModel(LIVE_MODEL_ID).find(
    (route) => route.provider === 'open_router',
  )!.routeId;

  afterEach(() => {
    setRouteRegistryPricingLookup(null);
  });

  it('prices a request served by the open_router route at that route sheet, not the canonical model price', async () => {
    const { getModelMetadataById: liveGetModelMetadataById } =
      await vi.importActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
    const canonical = liveGetModelMetadataById(LIVE_MODEL_ID);
    if (!canonical) throw new Error('Live canonical model fixture is missing from the catalog');

    const syntheticRouteSheet = {
      provider: 'open_router',
      isDefault: false,
      inputPerMillion: canonical.inputCost + 1,
      outputPerMillion: canonical.outputCost + 1,
      cacheReadPerMillion: 0.05,
      cacheWritePerMillion: 1.5,
      cacheWrite1hPerMillion: null,
    };
    setRouteRegistryPricingLookup({
      getRoutePricing: (routeId) => (routeId === LIVE_ROUTE_ID ? syntheticRouteSheet : null),
    });

    const pricing = LLMCostCalculator.getPricing(
      'open_router',
      LIVE_MODEL_ID,
      PRICED_ON,
      0,
      LIVE_ROUTE_ID,
    );

    expect(pricing.inputCostPer1MTokens).toBe(syntheticRouteSheet.inputPerMillion);
    expect(pricing.outputCostPer1MTokens).toBe(syntheticRouteSheet.outputPerMillion);
    expect(pricing.cachedInputCostPer1MTokens).toBe(syntheticRouteSheet.cacheReadPerMillion);
    expect(pricing.cachedWriteCostPer1MTokens).toBe(syntheticRouteSheet.cacheWritePerMillion);
    expect(pricing.inputCostPer1MTokens).not.toBe(canonical.inputCost);
    expect(pricing.cacheTokensDisjointFromInput).toBe(false);
  });

  it('falls back to the canonical model price for an unknown route id', async () => {
    const { getModelMetadataById: liveGetModelMetadataById } =
      await vi.importActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
    const canonical = liveGetModelMetadataById(LIVE_MODEL_ID);
    if (!canonical) throw new Error('Live canonical model fixture is missing from the catalog');

    const pricing = LLMCostCalculator.getPricing(
      'open_router',
      LIVE_MODEL_ID,
      PRICED_ON,
      0,
      'open_router/route-that-does-not-exist',
    );

    expect(pricing.inputCostPer1MTokens).toBe(canonical.inputCost);
    expect(pricing.outputCostPer1MTokens).toBe(canonical.outputCost);
    expect(pricing.cachedWrite1hCostPer1MTokens).toBe(canonical.cached_write_1h);
    expect(pricing.cacheTokensDisjointFromInput).toBe(true);
  });
});

describe('isCacheTokensDisjointFromInput, registry-sourced cache billing shape', () => {
  it('reads additional_to_input for anthropic and every anthropic-protocol proxy from the registry', () => {
    for (const providerId of [
      'anthropic',
      'cheaperinference_anthropic',
      'deepseek_anthropic',
      'moonshot_anthropic',
      'zhipu_anthropic',
    ]) {
      expect(isCacheTokensDisjointFromInput(providerId)).toBe(true);
    }
  });

  it('reads included_in_input for providers whose docs state cache tokens are a subset', () => {
    expect(isCacheTokensDisjointFromInput('openai')).toBe(false);
    expect(isCacheTokensDisjointFromInput('google')).toBe(false);
  });

  it('defaults an unresearched or unknown provider to non-disjoint rather than guessing', () => {
    expect(isCacheTokensDisjointFromInput('xai')).toBe(false);
    expect(isCacheTokensDisjointFromInput('not-a-real-provider')).toBe(false);
    expect(isCacheTokensDisjointFromInput(null)).toBe(false);
    expect(isCacheTokensDisjointFromInput(undefined)).toBe(false);
  });
});
