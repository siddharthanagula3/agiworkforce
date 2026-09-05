import { describe, expect, it } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';
import {
  applyInputTokenPricingTiers,
  applyLongContextPricing,
  canAccessModelForSubscriptionTier,
  canAccessManualModelSelection,
  evaluateModelEnvironment,
  MODEL_ENVIRONMENTS,
  getCoreManualModelOptions,
  getAutoRoutingProfiles,
  getAutoRoutingProfileTiers,
  getDefaultAutoRoutingProfile,
  getAllowedModelsForTier,
  getDefaultModelFor,
  getManagedCloudProviderIds,
  detectProviderFromModelId,
  getModelCostRates,
  getModelContextLimits,
  getEconomyFallbackModels,
  getModelIdsForProvider,
  getModelsForProvider,
  resolveMaxOutputTokens,
  modelsById,
  getModelMetadataById,
  isAutoModeModelId,
  isExecutableImageModel,
  getModelVariantPartner,
  getPickerModelTier,
  getPickerModels,
  getPickerModelsForRuntimeProfile,
  getModelsForTierAndSurface,
  getProviderSurface,
  getProviderProbeModel,
  getProviderModelCatalog,
  getProvidersWithImplementedHarnessFeature,
  getRoutingSlotModel,
  getTierPolicy,
  listCanonicalModels,
  modelsCatalog,
  normalizeModelId,
  normalizeSubscriptionAccessTier,
  requireProviderDefaultModel,
  resolveEffectiveModelPricing,
  resolveEffectiveModelPricingForInputTokens,
  SLOT_REGISTRY,
} from '../model-catalog';

describe('isExecutableImageModel', () => {
  it('requires the catalog MIME contract for every live Gemini image model', () => {
    const liveGeminiImage = listCanonicalModels().find(
      (model) => model.modelType === 'image' && model.imageApi === 'gemini',
    );
    expect(liveGeminiImage).toBeDefined();
    expect(isExecutableImageModel(liveGeminiImage!)).toBe(true);
    expect(isExecutableImageModel({ ...liveGeminiImage!, imageOutputMimeType: undefined })).toBe(
      false,
    );
  });
});

describe('resolveEffectiveModelPricing', () => {
  const scheduled = {
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

  it('selects the window covering the given date', () => {
    expect(resolveEffectiveModelPricing(scheduled, new Date('2030-02-15T00:00:00Z'))).toEqual({
      inputCost: 2,
      outputCost: 10,
      cached_input: 0.2,
      cached_write: 2.5,
      cached_write_1h: 4,
    });
  });

  it('treats effectiveUntil as inclusive and effectiveFrom as the next day', () => {
    expect(
      resolveEffectiveModelPricing(scheduled, new Date('2030-03-31T23:59:59.999Z')).inputCost,
    ).toBe(2);
    expect(
      resolveEffectiveModelPricing(scheduled, new Date('2030-04-01T00:00:00.000Z')).inputCost,
    ).toBe(3);
  });

  it('falls back to the model fields for keys a window does not override', () => {
    expect(resolveEffectiveModelPricing(scheduled, new Date('2031-01-01T00:00:00Z'))).toEqual({
      inputCost: 3,
      outputCost: 15,
      cached_input: 0.3,
      cached_write: 3.75,
      cached_write_1h: 6,
    });
  });

  it('returns the base rates for a model with no schedule, on any date', () => {
    const flat = { inputCost: 5, outputCost: 25, cached_input: 0.5 };
    expect(resolveEffectiveModelPricing(flat, new Date('2020-01-01T00:00:00Z'))).toEqual(
      resolveEffectiveModelPricing(flat, new Date('2099-12-31T00:00:00Z')),
    );
  });

  it('falls back to the base rates when no window covers the date', () => {
    const gapped = {
      inputCost: 5,
      outputCost: 25,
      pricingSchedule: [{ effectiveFrom: '2030-01-01', inputCost: 1, outputCost: 2 }],
    };
    expect(resolveEffectiveModelPricing(gapped, new Date('2026-08-15T00:00:00Z')).inputCost).toBe(
      5,
    );
  });

  it('falls back to the base rates for an unusable date', () => {
    expect(resolveEffectiveModelPricing(scheduled, new Date(Number.NaN)).inputCost).toBe(3);
  });

  it('uses strict thresholds and the greatest qualifying input-token pricing tier', () => {
    const tiered = {
      inputCost: 1,
      outputCost: 4,
      cached_input: 0.1,
      cached_write: 1.25,
      cached_write_1h: 2,
      inputTokenPricingTiers: [
        {
          thresholdTokens: 10,
          inputCost: 2,
          outputCost: 6,
          cached_input: 0.2,
          cached_write: 2.5,
        },
        {
          thresholdTokens: 20,
          inputCost: 3,
          outputCost: 9,
          cached_input: 0.3,
          cached_write: 3.75,
          cached_write_1h: 6,
        },
      ],
    };
    const asOf = new Date('2030-01-01T00:00:00Z');

    expect(resolveEffectiveModelPricingForInputTokens(tiered, asOf, 10)).toEqual({
      inputCost: 1,
      outputCost: 4,
      cached_input: 0.1,
      cached_write: 1.25,
      cached_write_1h: 2,
    });
    expect(resolveEffectiveModelPricingForInputTokens(tiered, asOf, 11)).toEqual({
      inputCost: 2,
      outputCost: 6,
      cached_input: 0.2,
      cached_write: 2.5,
      cached_write_1h: 2,
    });
    expect(resolveEffectiveModelPricingForInputTokens(tiered, asOf, 20)).toEqual({
      inputCost: 2,
      outputCost: 6,
      cached_input: 0.2,
      cached_write: 2.5,
      cached_write_1h: 2,
    });
    expect(resolveEffectiveModelPricingForInputTokens(tiered, asOf, 21)).toEqual({
      inputCost: 3,
      outputCost: 9,
      cached_input: 0.3,
      cached_write: 3.75,
      cached_write_1h: 6,
    });
  });

  it('composes dated, post-promo, and input-tier rates in that order', () => {
    const composed = {
      inputCost: 1,
      outputCost: 4,
      cached_input: 0.1,
      cached_write: 1.25,
      pricingSchedule: [
        {
          effectiveFrom: '2030-01-01',
          inputCost: 2,
          outputCost: 8,
          cached_input: 0.2,
          cached_write: 2.5,
        },
      ],
      promo_expires_at: '2030-06-01T00:00:00.000Z',
      post_promo_prices: {
        input: 3,
        output: 12,
        cached_input: 0.3,
        cached_write: 3.75,
      },
      inputTokenPricingTiers: [
        {
          thresholdTokens: 10,
          inputCost: 5,
          outputCost: 20,
          cached_input: 0.5,
          cached_write: 6.25,
        },
      ],
    };

    expect(
      resolveEffectiveModelPricingForInputTokens(
        composed,
        new Date('2030-05-31T23:59:59.999Z'),
        10,
      ),
    ).toMatchObject({ inputCost: 2, outputCost: 8, cached_input: 0.2, cached_write: 2.5 });
    expect(
      resolveEffectiveModelPricingForInputTokens(
        composed,
        new Date('2030-06-01T00:00:00.000Z'),
        10,
      ),
    ).toMatchObject({ inputCost: 3, outputCost: 12, cached_input: 0.3, cached_write: 3.75 });
    expect(
      resolveEffectiveModelPricingForInputTokens(
        composed,
        new Date('2030-06-01T00:00:00.000Z'),
        11,
      ),
    ).toMatchObject({ inputCost: 5, outputCost: 20, cached_input: 0.5, cached_write: 6.25 });
  });

  it('applies ordered tiers after a dated or promotional base has resolved', () => {
    const tiered = {
      inputTokenPricingTiers: [
        {
          thresholdTokens: 10,
          inputCost: 20,
          outputCost: 60,
          cached_input: 2,
          cached_write: 25,
        },
      ],
    };
    const alreadyResolvedBase = {
      inputCost: 7,
      outputCost: 21,
      cached_input: 0.7,
      cached_write: 8.75,
      cached_write_1h: 14,
    };

    expect(applyInputTokenPricingTiers(tiered, alreadyResolvedBase, 10)).toEqual(
      alreadyResolvedBase,
    );
    expect(applyInputTokenPricingTiers(tiered, alreadyResolvedBase, 11)).toEqual({
      inputCost: 20,
      outputCost: 60,
      cached_input: 2,
      cached_write: 25,
      cached_write_1h: 14,
    });
  });

  it('defaults an input-tier threshold to exclusive, admitting the tier only strictly above it', () => {
    const tiered = {
      inputTokenPricingTiers: [{ thresholdTokens: 200_000, inputCost: 4, outputCost: 12 }],
    };
    const base = { inputCost: 2, outputCost: 6 };

    expect(applyInputTokenPricingTiers(tiered, base, 200_000)).toEqual(base);
    expect(applyInputTokenPricingTiers(tiered, base, 200_001)).toMatchObject({
      inputCost: 4,
      outputCost: 12,
    });
  });

  it('admits an inclusive-boundary tier at exactly its threshold', () => {
    const tiered = {
      inputTokenPricingTiers: [
        {
          thresholdTokens: 200_000,
          thresholdBoundary: 'inclusive' as const,
          inputCost: 4,
          outputCost: 12,
        },
      ],
    };
    const base = { inputCost: 2, outputCost: 6 };

    expect(applyInputTokenPricingTiers(tiered, base, 199_999)).toEqual(base);
    expect(applyInputTokenPricingTiers(tiered, base, 200_000)).toMatchObject({
      inputCost: 4,
      outputCost: 12,
    });
  });

  it('treats an explicit exclusive boundary the same as the unmarked default', () => {
    const tiered = {
      inputTokenPricingTiers: [
        {
          thresholdTokens: 50,
          thresholdBoundary: 'exclusive' as const,
          inputCost: 9,
          outputCost: 27,
        },
      ],
    };
    const base = { inputCost: 1, outputCost: 3 };

    expect(applyInputTokenPricingTiers(tiered, base, 50)).toEqual(base);
    expect(applyInputTokenPricingTiers(tiered, base, 51)).toMatchObject({
      inputCost: 9,
      outputCost: 27,
    });
  });

  it('matches the OpenAI-documented exclusive boundary at exactly 272,000 input tokens', () => {
    const model = getModelMetadataById(requireProviderDefaultModel('openai'));
    const tier = model?.inputTokenPricingTiers?.[0];
    expect(tier?.thresholdTokens).toBe(272_000);
    const asOf = new Date('2030-01-01T00:00:00Z');

    expect(resolveEffectiveModelPricingForInputTokens(model!, asOf, 272_000).inputCost).toBe(
      model!.inputCost,
    );
    expect(resolveEffectiveModelPricingForInputTokens(model!, asOf, 272_001).inputCost).toBe(
      tier!.inputCost,
    );
  });

  it('matches the Google-documented exclusive boundary at exactly 200,000 input tokens', () => {
    const model = getModelsForProvider('google').find(
      (candidate) => candidate.inputTokenPricingTiers !== undefined,
    );
    const tier = model?.inputTokenPricingTiers?.[0];
    expect(tier?.thresholdTokens).toBe(200_000);
    const asOf = new Date('2030-01-01T00:00:00Z');

    expect(resolveEffectiveModelPricingForInputTokens(model!, asOf, 200_000).inputCost).toBe(
      model!.inputCost,
    );
    expect(resolveEffectiveModelPricingForInputTokens(model!, asOf, 200_001).inputCost).toBe(
      tier!.inputCost,
    );
  });

  it('matches the xAI-documented inclusive boundary at exactly 200,000 input tokens', () => {
    const model = getModelsForProvider('xai').find(
      (candidate) => candidate.inputTokenPricingTiers !== undefined,
    );
    const tier = model?.inputTokenPricingTiers?.[0];
    expect(tier?.thresholdTokens).toBe(200_000);
    expect(tier?.thresholdBoundary).toBe('inclusive');
    const asOf = new Date('2030-01-01T00:00:00Z');

    expect(resolveEffectiveModelPricingForInputTokens(model!, asOf, 199_999).inputCost).toBe(
      model!.inputCost,
    );
    expect(resolveEffectiveModelPricingForInputTokens(model!, asOf, 200_000).inputCost).toBe(
      tier!.inputCost,
    );
  });

  it('keeps the legacy singleton as read compatibility only when no array exists', () => {
    const legacy = {
      longContext: { thresholdTokens: 10, inputCost: 2, outputCost: 6 },
    };
    const base = { inputCost: 1, outputCost: 4 };

    expect(applyLongContextPricing(legacy, base, 11)).toEqual({
      inputCost: 2,
      outputCost: 6,
      cached_input: undefined,
      cached_write: undefined,
      cached_write_1h: undefined,
    });
    expect(
      applyInputTokenPricingTiers({ ...legacy, inputTokenPricingTiers: [] }, base, 11),
    ).toEqual(base);
  });

  it('resolves the catalog-owned Anthropic default rates identically on every date, refreshed after the Decision 22 retirement', () => {
    const defaultModel = getModelMetadataById(requireProviderDefaultModel('anthropic'));
    expect(defaultModel).not.toBeNull();
    expect(defaultModel?.pricingSchedule).toBeUndefined();

    const standard = {
      inputCost: 2,
      outputCost: 10,
      cached_input: 0.2,
      cached_write: 2.5,
      cached_write_1h: 4,
    };
    for (const day of ['2020-01-01', '2026-08-15', '2026-09-15', '2099-12-31']) {
      expect(resolveEffectiveModelPricing(defaultModel!, new Date(`${day}T00:00:00Z`))).toEqual(
        standard,
      );
    }
  });
});

describe('model catalog helpers', () => {
  it('keeps Max 15x on the Max model-access roster', () => {
    expect(normalizeSubscriptionAccessTier('max_15x')).toBe('max');
  });

  it('owns the current specialized embedding default in the canonical registry', () => {
    const embeddingSlot = (
      modelRegistry.policies.auto.slots as Record<string, { modelKey: string } | undefined>
    )['embedding_default'];
    const model = getModelMetadataById(embeddingSlot?.modelKey);

    expect(embeddingSlot?.modelKey).toBe(model?.id);
    expect(model).toMatchObject({
      provider: 'google',
      modelType: 'embedding',
      contextWindow: 8192,
      inputCost: 0.2,
    });
  });

  it('lists canonical models without alias duplication', () => {
    const models = listCanonicalModels();
    const ids = new Set(models.map((model) => model.id));

    expect(models.length).toBe(ids.size);
    expect(ids.has(requireProviderDefaultModel('openai'))).toBe(true);
    expect(ids.has(requireProviderDefaultModel('anthropic'))).toBe(true);
  });

  it('maps allowed models into picker-friendly tiers', () => {
    expect(getPickerModelTier(modelsCatalog.tierAllowedModels.economy[0])).toBe('economy');
    expect(getPickerModelTier(modelsCatalog.tierAllowedModels.pro_additions[0])).toBe('balanced');
    expect(getPickerModelTier(modelsCatalog.tierAllowedModels.flagship_additions[0])).toBe(
      'premium',
    );
  });

  it('returns normalized picker models for chat surfaces', () => {
    const models = getPickerModels({
      allowedProviders: ['openai', 'anthropic', 'google'],
    });

    expect(models.some((model) => model.provider === 'openai')).toBe(true);
    expect(models.some((model) => model.provider === 'anthropic')).toBe(true);
    expect(models.every((model) => ['economy', 'balanced', 'premium'].includes(model.tier))).toBe(
      true,
    );
    expect(
      models.every((model) => model.contextWindow !== undefined && model.contextWindow > 0),
    ).toBe(true);
  });

  it('keeps specialized media, voice, and embedding models out of manual chat options', () => {
    const chatModelTypes = new Set(['chat', 'code', 'reasoning', 'multimodal']);
    const options = getCoreManualModelOptions();

    expect(options.length).toBeGreaterThan(0);
    expect(
      options.every((option) => {
        const model = getModelMetadataById(option.id);
        return model !== null && chatModelTypes.has(model.modelType);
      }),
    ).toBe(true);
    const specializedModelIds = new Set(
      listCanonicalModels()
        .filter((model) => !chatModelTypes.has(model.modelType))
        .map((model) => model.id),
    );
    expect(options.every((option) => !specializedModelIds.has(option.id))).toBe(true);
  });

  it('derives Mobile Cloud picker rows from the canonical runtime profile', () => {
    const models = getPickerModelsForRuntimeProfile('mobile/cloud-chat');
    const profile = modelRegistry.runtimeProfiles['mobile/cloud-chat'];
    const allowedHarnesses = new Set(profile.allowedHarnessIds);
    const admittedModelKeys = new Set(
      Object.values(modelRegistry.routes)
        .filter(
          (route) =>
            route.selectable &&
            route.availability === 'live' &&
            route.trustModes.includes(profile.trustMode) &&
            allowedHarnesses.has(route.harnessId),
        )
        .map((route) => route.modelKey),
    );

    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => admittedModelKeys.has(model.id))).toBe(true);
    expect(new Set(models.map((model) => model.provider)).size).toBeGreaterThan(3);
  });

  it('derives Desktop Cloud picker rows after the DCL-4 runtime cutover', () => {
    const models = getPickerModelsForRuntimeProfile('desktop/cloud-chat');
    expect(models.length).toBeGreaterThan(0);
    expect(models.map((model) => model.id)).toContain(
      modelsCatalog.providers['openai']?.taskRouting?.fast_completion,
    );
  });

  it('returns no selectable rows for an unknown runtime profile', () => {
    expect(getPickerModelsForRuntimeProfile('not-a-runtime-profile')).toEqual([]);
  });

  it('composes subscription-tier and runtime-profile admission in one shared selector', () => {
    const basicModels = getModelsForTierAndSurface('basic', 'mobile/cloud-chat');
    const proModels = getModelsForTierAndSurface('pro', 'mobile/cloud-chat');
    const maxModels = getModelsForTierAndSurface('max', 'mobile/cloud-chat');
    const maxPlusModels = getModelsForTierAndSurface('max_plus', 'mobile/cloud-chat');

    const economyIds = new Set(getAllowedModelsForTier('economy'));
    const proAdditionIds = new Set(getAllowedModelsForTier('pro_additions'));
    const basicIds = new Set(basicModels.map((model) => model.id));
    const proIds = new Set(proModels.map((model) => model.id));
    expect(economyIds.size).toBeGreaterThan(0);
    expect(proAdditionIds.size).toBeGreaterThan(0);
    expect([...economyIds].every((id) => basicIds.has(id))).toBe(true);
    expect([...proAdditionIds].some((id) => !basicIds.has(id))).toBe(true);
    expect([...economyIds].every((id) => proIds.has(id))).toBe(true);
    expect(maxPlusModels).toEqual(maxModels);
    const desktopBasicIds = new Set(
      getModelsForTierAndSurface('basic', 'desktop/cloud-chat').map((model) => model.id),
    );
    expect([...economyIds].every((id) => desktopBasicIds.has(id))).toBe(true);
    expect(getModelsForTierAndSurface('basic', 'not-a-runtime-profile')).toEqual([]);
  });

  it('keeps Basic on the economy roster while preserving higher-tier inheritance', () => {
    for (const modelId of getAllowedModelsForTier('economy')) {
      expect(canAccessModelForSubscriptionTier(modelId, 'basic')).toBe(true);
      expect(canAccessModelForSubscriptionTier(modelId, 'pro')).toBe(true);
    }
    for (const modelId of getAllowedModelsForTier('pro_additions')) {
      expect(canAccessModelForSubscriptionTier(modelId, 'basic')).toBe(false);
      expect(canAccessModelForSubscriptionTier(modelId, 'pro')).toBe(true);
    }
    for (const modelId of getAllowedModelsForTier('flagship_additions')) {
      expect(canAccessModelForSubscriptionTier(modelId, 'max_plus')).toBe(true);
    }
  });

  it('derives the single selectable Auto from routing policy', () => {
    const profiles = getAutoRoutingProfiles();

    expect(profiles.map((profile) => profile.id)).toEqual(['auto']);
    expect(profiles.map((profile) => profile.profile)).toEqual(['balanced']);
    expect(profiles.every((profile) => profile.label.trim().length > 0)).toBe(true);
    expect(profiles.every((profile) => profile.description.trim().length > 0)).toBe(true);
    expect(getDefaultAutoRoutingProfile()).toEqual(profiles[0]);
  });

  it('exposes every routing profile as its own tier for a direct tier picker', () => {
    const tiers = getAutoRoutingProfileTiers();

    expect(tiers.map((tier) => tier.profile)).toEqual(['economy', 'balanced', 'premium']);
    expect(new Set(tiers.map((tier) => tier.id)).size).toBe(tiers.length);
    expect(tiers.every((tier) => tier.label.trim().length > 0)).toBe(true);
    expect(tiers.every((tier) => tier.description.trim().length > 0)).toBe(true);
    expect(tiers.map((tier) => tier.id)).not.toContain(getDefaultAutoRoutingProfile().id);
  });

  it('builds context limit and cost maps from canonical ids', () => {
    const anthropicModel = requireProviderDefaultModel('anthropic');
    const aliasId = normalizeModelId(anthropicModel);
    const openaiModel = requireProviderDefaultModel('openai');
    const contextLimits = getModelContextLimits([openaiModel, anthropicModel]);
    const costRates = getModelCostRates([openaiModel, anthropicModel]);

    expect(aliasId).toBe(anthropicModel);
    const unknownModelId = 'fixture-removed-model';
    expect(normalizeModelId(unknownModelId)).toBe(unknownModelId);
    expect(contextLimits[openaiModel]).toBeGreaterThan(0);
    expect(contextLimits[anthropicModel]).toBeGreaterThan(0);
    expect(costRates[openaiModel]).toMatchObject({ provider: 'openai' });
    expect(costRates[anthropicModel]).toMatchObject({ provider: 'anthropic' });
  });

  it('omits an unproven token context for character-bounded video APIs', () => {
    const runwayModelId = getModelIdsForProvider('runway', { modelTypes: ['video'] })[0];
    const runway = getModelMetadataById(runwayModelId);
    const runwayProviderModel = getProviderModelCatalog('runway').find(
      (model) => model.id === runwayModelId,
    );

    expect(runway).toMatchObject({
      modelType: 'video',
      availability: 'unavailable',
    });
    expect(runway?.contextWindow).toBeUndefined();
    expect(runwayProviderModel).toBeDefined();
    expect(getModelContextLimits([runwayProviderModel!.id])).toEqual({});
    expect(runwayProviderModel).toBeDefined();
    expect(runwayProviderModel).not.toHaveProperty('contextWindow');
  });

  it('derives provider model lists from the canonical catalog', () => {
    const anthropicIds = getModelIdsForProvider('anthropic', {
      modelTypes: ['chat', 'code', 'reasoning', 'multimodal'],
    });

    expect(anthropicIds).toContain(requireProviderDefaultModel('anthropic'));
    expect(anthropicIds.length).toBeGreaterThan(1);
    expect(anthropicIds).not.toContain('fixture-retired-model');
  });

  it('projects provider adapter catalogs from the generated provider index', () => {
    const openaiCatalog = getProviderModelCatalog('openai');
    const expectedKeys = modelRegistry.providerModelKeys.openai;

    expect(openaiCatalog.map((model) => model.id)).toEqual(expectedKeys);
    expect(openaiCatalog.every((model) => model.provider === 'openai')).toBe(true);
    const fastModel = getModelMetadataById(
      modelsCatalog.providers['openai']?.taskRouting?.fast_completion,
    );
    expect(fastModel).not.toBeNull();
    expect(openaiCatalog.find((model) => model.id === fastModel!.id)).toMatchObject({
      contextWindow: fastModel!.contextWindow,
      maxOutputTokens: fastModel!.maxOutputTokens,
      inputCostPerMillion: fastModel!.inputCost,
      outputCostPerMillion: fastModel!.outputCost,
      capabilities: { streaming: true, tools: true, vision: true },
    });
    expect(getProviderModelCatalog('not-a-provider')).toEqual([]);
  });

  it('derives provider execution support from generated harness features', () => {
    expect(getProvidersWithImplementedHarnessFeature('webSearchInjection').sort()).toEqual([
      'anthropic',
      'google',
      'openai',
    ]);
    expect(getProvidersWithImplementedHarnessFeature('webSearch').sort()).toEqual([
      'anthropic',
      'google',
      'managed_cloud',
      'openai',
      'perplexity',
    ]);
    expect(getProvidersWithImplementedHarnessFeature('not-a-feature')).toEqual([]);
  });

  it('derives every compatibility routing-slot assignment from the generated registry', () => {
    for (const [slotId, definition] of Object.entries(SLOT_REGISTRY)) {
      const registrySlot = modelRegistry.policies.auto.slots[
        slotId as keyof typeof modelRegistry.policies.auto.slots
      ] as { modelKey: string; label: string; description: string } | undefined;
      expect(registrySlot, `${slotId} must be registry-owned`).toBeDefined();
      expect(definition.modelId).toBe(registrySlot?.modelKey);
      expect(definition.label).toBe(registrySlot?.label);
      expect(definition.description).toBe(registrySlot?.description);
      expect(definition.provider).toBe(
        modelRegistry.models[registrySlot!.modelKey as keyof typeof modelRegistry.models].identity
          .provider,
      );
    }
  });

  it('detects providers and resolves auto modes from shared routing defaults', () => {
    const anthropicDefault = requireProviderDefaultModel('anthropic');
    const explicitModel = getRoutingSlotModel('general_balanced_pro');
    expect(isAutoModeModelId('auto')).toBe(true);
    expect(isAutoModeModelId('AUTO-BALANCED')).toBe(false);
    expect(isAutoModeModelId(explicitModel)).toBe(false);
    expect(isAutoModeModelId(null)).toBe(false);
    expect(detectProviderFromModelId(anthropicDefault)).toBe('anthropic');
  });

  it('derives variant partners, provider probes, and economy fallbacks from the catalog', () => {
    const modelsWithPartners = listCanonicalModels().filter((model) => model.variantPartner);
    expect(modelsWithPartners.length).toBeGreaterThan(0);
    for (const model of modelsWithPartners) {
      expect(getModelMetadataById(getModelVariantPartner(model.id))).not.toBeNull();
    }

    for (const provider of ['openai', 'anthropic'] as const) {
      const probeId = getProviderProbeModel(provider);
      expect(getModelMetadataById(probeId)?.provider).toBe(provider);
    }

    const fallbackIds = getEconomyFallbackModels().map((entry) => entry.model);
    expect(fallbackIds.length).toBeGreaterThan(0);
    expect(fallbackIds.every((id) => getAllowedModelsForTier('economy').includes(id))).toBe(true);

    const coreOptions = getCoreManualModelOptions();
    const optionIds = new Set(coreOptions.map((entry) => entry.id));
    expect(optionIds.has(requireProviderDefaultModel('openai'))).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'fixture-removed-model')).toBe(false);
    expect(
      coreOptions.every((entry) => getModelMetadataById(entry.id)?.availability !== 'unavailable'),
    ).toBe(true);
  });

  it('unknown aliases are not in catalog (canonicalization removed for fresh start)', () => {
    const unknownModelId = 'fixture-removed-model';
    const currentModelId = modelsCatalog.providers['openai']?.taskRouting?.fast_completion;
    expect(getModelMetadataById(currentModelId)?.id).toBe(currentModelId);
    expect(getModelMetadataById(unknownModelId)).toBeNull();
    expect(normalizeModelId(unknownModelId)).toBe(unknownModelId);
  });

  it('classifies provider surfaces and managed cloud provider visibility', () => {
    const managedVideoProvider = listCanonicalModels().find(
      (model) =>
        model.modelType === 'video' && model.videoGeneration?.pricing?.unit === 'video_tokens',
    )?.provider;
    expect(managedVideoProvider).toBeDefined();

    expect(getProviderSurface('openai')).toBe('managed_cloud');
    expect(getProviderSurface('managed_cloud')).toBe('managed_cloud');
    expect(getProviderSurface(managedVideoProvider!)).toBe('managed_cloud');
    expect(getProviderSurface('nvidia_nim')).toBe('byok');
    expect(getProviderSurface('ollama')).toBe('local');
    expect(getProviderSurface('groq')).toBe('managed_cloud');
    expect(getProviderSurface('mistral')).toBe('managed_cloud');

    const managedCloudProviders = getManagedCloudProviderIds();
    expect(managedCloudProviders).toContain('groq');
    expect(managedCloudProviders).toContain('mistral');
    expect(managedCloudProviders).toContain('perplexity');
    expect(getManagedCloudProviderIds({ includeSearchProviders: false })).toEqual(
      managedCloudProviders.filter((provider) => provider !== 'perplexity'),
    );
  });

  it('defines tier policy and slot routing from one shared source', () => {
    for (const slot of [
      'general_fast',
      'general_balanced',
      'search_fast',
      'search_premium',
      'computer_use',
    ] as const) {
      expect(getRoutingSlotModel(slot)).toBe(modelRegistry.policies.auto.slots[slot].modelKey);
    }
    const codingFastModel = getRoutingSlotModel('coding_fast');
    expect(getAllowedModelsForTier('economy')).toContain(codingFastModel);
    expect(getModelMetadataById(codingFastModel)).toMatchObject({
      tierPolicy: { minTier: 'free' },
      capabilities: { tools: true, codeExecution: true },
    });
    expect(getModelMetadataById(getRoutingSlotModel('coding_premium'))).not.toBeNull();
    expect(canAccessManualModelSelection('free')).toBe(false);
    expect(canAccessManualModelSelection('hobby')).toBe(true);
    expect(canAccessManualModelSelection('basic')).toBe(true);
    expect(canAccessManualModelSelection('pro')).toBe(true);
    expect(canAccessManualModelSelection('max')).toBe(true);
    expect(canAccessManualModelSelection('enterprise')).toBe(true);

    expect(getTierPolicy('free')).toMatchObject({
      surfacedUx: 'auto_only',
      manualModelSelection: false,
      allowSearch: true,
      allowMediaGeneration: false,
    });
    expect(getTierPolicy('pro')).toMatchObject({
      surfacedUx: 'auto_plus_manual',
      manualModelSelection: true,
      allowComputerUse: true,
      allowBrowserDom: true,
    });
    expect(getTierPolicy('max')).toMatchObject({
      surfacedUx: 'auto_plus_manual',
      manualModelSelection: true,
      allowMediaGeneration: true,
    });
  });
});

describe('getDefaultModelFor, tier-aware default model resolution', () => {
  it('returns workhorse_general for free tier on every kind (Free only allows that slot)', () => {
    const workhorse = getRoutingSlotModel('workhorse_general');
    expect(getDefaultModelFor('free', 'chat')).toBe(workhorse);
    expect(getDefaultModelFor('free', 'fast-status')).toBe(workhorse);
    expect(getDefaultModelFor('free', 'computer-use')).toBe(workhorse);
    expect(getDefaultModelFor('free', 'reasoning')).toBe(workhorse);
  });

  it('routes free tier voice through the voice transcription slot', () => {
    expect(getDefaultModelFor('free', 'voice')).toBe(getRoutingSlotModel('voice_transcription'));
  });

  it('hobby/basic chat stays on the economy workhorse', () => {
    expect(getDefaultModelFor('hobby', 'chat')).toBe(getDefaultModelFor('free', 'chat'));
    expect(getDefaultModelFor('basic', 'chat')).toBe(getDefaultModelFor('free', 'chat'));
  });

  it('hobby fast-status stays on the economy workhorse', () => {
    expect(getDefaultModelFor('hobby', 'fast-status')).toBe(
      getDefaultModelFor('free', 'fast-status'),
    );
  });

  it('hobby reasoning stays on the economy workhorse', () => {
    expect(getDefaultModelFor('hobby', 'reasoning')).toBe(getDefaultModelFor('free', 'reasoning'));
  });

  it('pro chat resolves to general_balanced_pro (preferred Pro slot)', () => {
    expect(getDefaultModelFor('pro', 'chat')).toBe(getRoutingSlotModel('general_balanced_pro'));
  });

  it('pro reasoning resolves to reasoning_premium_pro', () => {
    expect(getDefaultModelFor('pro', 'reasoning')).toBe(
      getRoutingSlotModel('reasoning_premium_pro'),
    );
  });

  it('pro computer-use resolves to the standard computer_use slot', () => {
    expect(getDefaultModelFor('pro', 'computer-use')).toBe(getRoutingSlotModel('computer_use'));
  });

  it('max computer-use resolves to computer_use_premium', () => {
    expect(getDefaultModelFor('max', 'computer-use')).toBe(
      getRoutingSlotModel('computer_use_premium'),
    );
  });

  it('max reasoning resolves to reasoning_premium_pro (preferred Pro+ slot)', () => {
    expect(getDefaultModelFor('max', 'reasoning')).toBe(
      getRoutingSlotModel('reasoning_premium_pro'),
    );
  });

  it('enterprise chat resolves to general_balanced_pro (same as Pro)', () => {
    expect(getDefaultModelFor('enterprise', 'chat')).toBe(
      getRoutingSlotModel('general_balanced_pro'),
    );
  });

  it('returns the catalog model for the resolved slot, never a hardcoded literal', () => {
    const proChat = getDefaultModelFor('pro', 'chat');
    expect(proChat).toBe(getRoutingSlotModel('general_balanced_pro'));
    expect(proChat.length).toBeGreaterThan(0);
  });

  it('treats unknown / null tier as free and returns workhorse_general', () => {
    const workhorse = getRoutingSlotModel('workhorse_general');
    expect(getDefaultModelFor(null, 'chat')).toBe(workhorse);
    expect(getDefaultModelFor(undefined, 'chat')).toBe(workhorse);
    expect(getDefaultModelFor('totally-bogus-tier', 'chat')).toBe(workhorse);
  });

  it('unknown tier falls back to free and returns workhorse_general', () => {
    const workhorse = getRoutingSlotModel('workhorse_general');
    expect(getDefaultModelFor('pro_plus', 'chat')).toBe(workhorse);
    expect(getDefaultModelFor('pro_plus', 'computer-use')).toBe(workhorse);
  });
});

describe('provider-owned model canonicalization', () => {
  it('resolves every authored compatibility alias to its catalog target', () => {
    const aliases = Object.values(modelsCatalog.providers).flatMap((provider) =>
      Object.entries(provider.canonicalization ?? {}),
    );
    expect(aliases.length).toBeGreaterThan(0);
    for (const [alias, target] of aliases) {
      const expectedId = normalizeModelId(target);
      expect(expectedId, `missing canonical target for ${alias}`).not.toBeNull();
      expect(getModelMetadataById(alias)?.id).toBe(expectedId);
    }
  });

  it('unknown model ID returns null gracefully (no throw)', () => {
    expect(getModelMetadataById('fixture-model-that-does-not-exist')).toBeNull();
    expect(getModelMetadataById(null)).toBeNull();
    expect(getModelMetadataById(undefined)).toBeNull();
  });
});

describe('model env-gating (requiresEnvironment)', () => {
  it('SAFETY: no current model declares requiresEnvironment (Phase A is a pure no-op)', () => {
    const gated = listCanonicalModels().filter((m) => m.requiresEnvironment !== undefined);
    expect(gated).toEqual([]);
  });

  it('every requiresEnvironment value (if any appear) is a known environment', () => {
    const known = new Set<string>(MODEL_ENVIRONMENTS);
    for (const model of listCanonicalModels()) {
      if (model.requiresEnvironment !== undefined) {
        expect(known.has(model.requiresEnvironment)).toBe(true);
      }
    }
  });

  describe('evaluateModelEnvironment', () => {
    it('is selectable when the model requires no environment', () => {
      expect(evaluateModelEnvironment(undefined, undefined)).toEqual({ selectable: true });
      expect(evaluateModelEnvironment(undefined, { configured: false })).toEqual({
        selectable: true,
      });
    });

    it('FAIL-CLOSED: an env-required model is not selectable when the env is unconfigured', () => {
      const verdict = evaluateModelEnvironment('e2b', { configured: false });
      expect(verdict.selectable).toBe(false);
      expect(verdict.reason).toMatch(/managed compute/i);
    });

    it('FAIL-CLOSED: an env-required model is not selectable with no availability info', () => {
      expect(evaluateModelEnvironment('e2b', undefined).selectable).toBe(false);
    });

    it('is selectable only when the env is configured AND available', () => {
      expect(evaluateModelEnvironment('e2b', { configured: true }).selectable).toBe(true);
      expect(
        evaluateModelEnvironment('e2b', { configured: true, available: true }).selectable,
      ).toBe(true);
      expect(
        evaluateModelEnvironment('e2b', { configured: true, available: false }).selectable,
      ).toBe(false);
    });

    it('local-runtime requirement surfaces a runtime-install reason', () => {
      const verdict = evaluateModelEnvironment('local-runtime', { configured: false });
      expect(verdict.selectable).toBe(false);
      expect(verdict.reason).toMatch(/local model runtime/i);
    });
  });

  describe('web-search capability regression guard', () => {
    it('every current-generation Anthropic model advertises search support', () => {
      const anthropicModels = listCanonicalModels().filter(
        (model) => model.provider === 'anthropic' && model.availability !== 'unavailable',
      );
      expect(anthropicModels.length).toBeGreaterThan(0);
      for (const metadata of anthropicModels) {
        expect(metadata.capabilities.search, `${metadata.id} capabilities.search`).toBe(true);
      }
    });
  });
});

describe('resolveMaxOutputTokens', () => {
  const ANSWER_TOKEN_CEILING = 8_192;
  const TEXT_TYPES = new Set(['chat', 'code', 'reasoning', 'multimodal', 'search']);

  it('gives a text model room for a long answer', () => {
    // A fixed 1024-token default cut every long response short and made the
    // reader chase the rest with Continue, which is where seams come from.
    const textModels = listCanonicalModels().filter((m) => TEXT_TYPES.has(m.modelType));
    expect(textModels.length).toBeGreaterThanOrEqual(2);
    for (const model of textModels.slice(0, 2)) {
      expect(resolveMaxOutputTokens(model.id)).toBe(ANSWER_TOKEN_CEILING);
    }
  });

  it('never exceeds what the model itself declares', () => {
    for (const metadata of Object.values(modelsById)) {
      const resolved = resolveMaxOutputTokens(metadata.id);
      if (typeof metadata.maxOutputTokens === 'number') {
        expect(resolved, `${metadata.id} output limit`).toBeLessThanOrEqual(
          metadata.maxOutputTokens,
        );
      }
      if (typeof metadata.contextWindow === 'number' && metadata.contextWindow > 0) {
        expect(resolved, `${metadata.id} context window`).toBeLessThanOrEqual(
          metadata.contextWindow,
        );
      }
    }
  });

  it('keeps every text model above the old fixed ceiling', () => {
    for (const metadata of Object.values(modelsById)) {
      if (!TEXT_TYPES.has(metadata.modelType)) continue;
      expect(resolveMaxOutputTokens(metadata.id), `${metadata.id}`).toBeGreaterThan(1024);
    }
  });

  it('does not hand a token budget to a model that does not emit tokens', () => {
    for (const metadata of Object.values(modelsById)) {
      if (TEXT_TYPES.has(metadata.modelType)) continue;
      expect(resolveMaxOutputTokens(metadata.id), `${metadata.id}`).toBeLessThanOrEqual(1024);
    }
  });

  it('resolves an alias the same way as its canonical model', () => {
    const [sampleModel] = listCanonicalModels();
    if (!sampleModel) throw new Error('the canonical catalogue is empty');
    expect(resolveMaxOutputTokens(sampleModel.id)).toBe(
      resolveMaxOutputTokens(normalizeModelId(sampleModel.id)),
    );
  });

  it('falls back for an id the catalogue does not carry', () => {
    expect(resolveMaxOutputTokens('not-a-model')).toBeGreaterThan(1024);
    expect(resolveMaxOutputTokens(null)).toBeGreaterThan(1024);
  });
});
