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
  getDefaultAutoRoutingProfile,
  getAllowedModelsForTier,
  getDefaultModelFor,
  getManagedCloudProviderIds,
  detectProviderFromModelId,
  getModelCostRates,
  getModelContextLimits,
  getEconomyFallbackModels,
  getModelIdsForProvider,
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
  resolveAutoModeModel,
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

  it('resolves the catalog-owned Anthropic default rates identically on every date', () => {
    const defaultModel = getModelMetadataById(requireProviderDefaultModel('anthropic'));
    expect(defaultModel).not.toBeNull();
    expect(defaultModel?.pricingSchedule).toBeUndefined();

    const standard = {
      inputCost: 3,
      outputCost: 15,
      cached_input: 0.3,
      cached_write: 3.75,
      cached_write_1h: 6,
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
    const workhorse = getRoutingSlotModel('workhorse_general');
    expect(isAutoModeModelId('auto')).toBe(true);
    expect(isAutoModeModelId('AUTO-BALANCED')).toBe(false);
    expect(isAutoModeModelId(explicitModel)).toBe(false);
    expect(isAutoModeModelId(null)).toBe(false);
    expect(detectProviderFromModelId(anthropicDefault)).toBe('anthropic');
    expect(resolveAutoModeModel('auto-economy', 'free')).toBe(workhorse);
    expect(resolveAutoModeModel('auto-balanced', 'hobby')).toBe(workhorse);
    expect(resolveAutoModeModel('auto-balanced', 'pro')).toBe(explicitModel);
    expect(resolveAutoModeModel('auto-premium', 'max')).toBe(
      modelRegistry.policies.auto.slots.flagship_general.modelKey,
    );
    expect(resolveAutoModeModel('auto-premium', 'free')).toBe(workhorse);
    expect(resolveAutoModeModel('auto-premium', 'hobby')).toBe(workhorse);
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

describe('resolveAutoModeModel — task-aware routing', () => {
  it('keeps economy, balanced, and premium profiles distinct at Max tier', () => {
    const slots = modelRegistry.policies.auto.slots;
    expect(resolveAutoModeModel('auto-economy', 'max', 'coding')).toBe(
      slots.workhorse_general.modelKey,
    );
    expect(resolveAutoModeModel('auto-balanced', 'max', 'coding')).toBe(
      slots.coding_balanced.modelKey,
    );
    expect(resolveAutoModeModel('auto-premium', 'max', 'coding')).toBe(
      slots.flagship_coding.modelKey,
    );
  });

  describe('backward compat (no taskType)', () => {
    it('legacy 2-arg call still resolves to general slot for hobby auto-balanced', () => {
      const result = resolveAutoModeModel('auto-balanced', 'hobby');
      expect(result).not.toBeNull();
    });
    it('legacy 2-arg call still resolves to general slot for pro auto-balanced', () => {
      const result = resolveAutoModeModel('auto-balanced', 'pro');
      expect(result).not.toBeNull();
    });
    it('undefined taskType uses legacy auto-mode path', () => {
      expect(resolveAutoModeModel('auto-economy', 'hobby', undefined)).toBe(
        resolveAutoModeModel('auto-economy', 'hobby'),
      );
    });
  });

  describe('explicit model selection is respected (not re-routed by task)', () => {
    it('concrete model + coding taskType returns the SAME model, not the coding slot', () => {
      const explicitModel = getRoutingSlotModel('general_balanced_pro');
      expect(resolveAutoModeModel(explicitModel, 'pro', 'coding')).toBe(explicitModel);
    });
    it('concrete model + reasoning taskType returns the SAME model', () => {
      const explicitModel = getRoutingSlotModel('general_balanced_pro');
      expect(resolveAutoModeModel(explicitModel, 'pro', 'reasoning')).toBe(explicitModel);
    });
    it('auto alias still task-routes (control — task routing only applies to auto-*)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'coding')).toBe(
        getRoutingSlotModel('coding_premium_pro'),
      );
    });
  });

  describe('Pro tier task-aware routing', () => {
    it('coding task → coding_premium_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'coding')).toBe(
        getRoutingSlotModel('coding_premium_pro'),
      );
    });
    it('reasoning task → reasoning_premium_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'reasoning')).toBe(
        getRoutingSlotModel('reasoning_premium_pro'),
      );
    });
    it('multimodal task → multimodal_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'multimodal')).toBe(
        getRoutingSlotModel('multimodal_pro'),
      );
    });
    it('long_context task → long_context_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'long_context')).toBe(
        getRoutingSlotModel('long_context_pro'),
      );
    });
    it('general task → general_balanced_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'general')).toBe(
        getRoutingSlotModel('general_balanced_pro'),
      );
    });
    it('simple_chat task → general_balanced_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'simple_chat')).toBe(
        getRoutingSlotModel('general_balanced_pro'),
      );
    });
    it('creative_writing → canonical balanced creative slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'creative_writing')).toBe(
        modelRegistry.policies.auto.slots.creative_balanced.modelKey,
      );
    });
    it('research → canonical fast search slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'research')).toBe(
        modelRegistry.policies.auto.slots.search_fast.modelKey,
      );
    });
    it('agentic → general_balanced_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'agentic')).toBe(
        getRoutingSlotModel('general_balanced_pro'),
      );
    });
    it('image_generation → shared image_generation slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'pro', 'image_generation');
      expect(result).not.toBeNull();
    });
    it('computer-use → computer_use slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'pro', 'computer-use');
      expect(result).not.toBeNull();
    });
  });

  describe('Free tier task-aware routing', () => {
    it('coding → the allowed economy coding slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'coding');
      expect(result).toBe(modelRegistry.policies.auto.slots.coding_fast.modelKey);
    });
    it('reasoning → economy reasoning slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'reasoning');
      expect(result).toBe(getRoutingSlotModel('reasoning_economy'));
    });
    it('multimodal → workhorse_general', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'multimodal');
      expect(result).toBe(getRoutingSlotModel('workhorse_general'));
    });
  });

  describe('Free tier task-aware fallback behavior', () => {
    it('coding → uses the allowed economy coding slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'coding');
      expect(result).toBe(modelRegistry.policies.auto.slots.coding_fast.modelKey);
    });
    it('reasoning → uses the allowed economy reasoning slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'reasoning');
      expect(result).toBe(getRoutingSlotModel('reasoning_economy'));
    });
    it('image_generation → falls back to workhorse_general (no media on free)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'image_generation');
      expect(result).toBe(getRoutingSlotModel('workhorse_general'));
    });
  });

  describe('Max + Enterprise task-aware routing respects the selected Auto profile', () => {
    it('Max balanced coding → balanced coding slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'max', 'coding')).toBe(
        modelRegistry.policies.auto.slots.coding_balanced.modelKey,
      );
    });
    it('Enterprise balanced coding → balanced coding slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'enterprise', 'coding')).toBe(
        modelRegistry.policies.auto.slots.coding_balanced.modelKey,
      );
    });
    it('Max premium coding → flagship coding slot', () => {
      expect(resolveAutoModeModel('auto-premium', 'max', 'coding')).toBe(
        modelRegistry.policies.auto.slots.flagship_coding.modelKey,
      );
    });
    it('BYOK premium coding → flagship coding slot without a managed tier clamp', () => {
      expect(resolveAutoModeModel('auto-premium', 'byok', 'coding')).toBe(
        modelRegistry.policies.auto.slots.flagship_coding.modelKey,
      );
    });
    it('Max balanced general → balanced general slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'max', 'general')).toBe(
        modelRegistry.policies.auto.slots.general_balanced.modelKey,
      );
    });
  });

  describe('US-only routing toggle (Pro+/Max only)', () => {
    it('Max reasoning + usOnly=true skips every excluded provider', () => {
      expect(resolveAutoModeModel('auto-balanced', 'max', 'reasoning')).toBe(
        getRoutingSlotModel('reasoning_premium_pro'),
      );
      const result = resolveAutoModeModel('auto-balanced', 'max', 'reasoning', {
        usOnly: true,
      });
      const resultProvider = getModelMetadataById(result)?.provider;
      expect(resultProvider).toBeDefined();
      expect(modelRegistry.policies.auto.providerPolicies.usOnly.excludedProviders).not.toContain(
        resultProvider,
      );
    });

    it('Max reasoning + usOnly=true does not return the excluded default route', () => {
      const result = resolveAutoModeModel('auto-balanced', 'max', 'reasoning', { usOnly: true });
      expect(result).not.toBe(getRoutingSlotModel('reasoning_premium_pro'));
    });

    it('Pro tier ignores usOnly flag (toggle gated by usOnlyRoutingAvailable)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'pro', 'reasoning', { usOnly: true });
      expect(result).toBe(resolveAutoModeModel('auto-balanced', 'pro', 'reasoning'));
    });

    it('Free tier reasoning with usOnly=true is ignored (toggle not available)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'reasoning', { usOnly: true });
      expect(result).toBe(resolveAutoModeModel('auto-balanced', 'free', 'reasoning'));
    });

    it('Max balanced coding with usOnly=true stays on the balanced Anthropic slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'max', 'coding', { usOnly: true });
      expect(result).toBe(modelRegistry.policies.auto.slots.coding_balanced.modelKey);
    });

    it('Max balanced general with usOnly=true keeps the balanced OpenAI slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'max', 'general', { usOnly: true });
      expect(result).toBe(modelRegistry.policies.auto.slots.general_balanced.modelKey);
    });
  });
});

describe('getDefaultModelFor — tier-aware default model resolution', () => {
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

  it('returns the catalog model for the resolved slot — never a hardcoded literal', () => {
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
