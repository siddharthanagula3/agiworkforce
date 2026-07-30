import { describe, expect, it } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';
import {
  canAccessModelForSubscriptionTier,
  canAccessManualModelSelection,
  evaluateModelEnvironment,
  MODEL_ENVIRONMENTS,
  getCoreManualModelOptions,
  getAutoRoutingProfiles,
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
  SLOT_REGISTRY,
} from '../model-catalog';

describe('model catalog helpers', () => {
  it('keeps Max 15x on the Max model-access roster', () => {
    expect(normalizeSubscriptionAccessTier('max_15x')).toBe('max');
  });

  it('owns the current specialized embedding default in the canonical registry', () => {
    const embeddingSlot = (
      modelRegistry.policies.auto.slots as Record<string, { modelKey: string } | undefined>
    )['embedding_default'];
    const model = getModelMetadataById(embeddingSlot?.modelKey);

    expect(embeddingSlot?.modelKey).toBe('gemini-embedding-2');
    expect(model).toMatchObject({
      id: 'gemini-embedding-2',
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
    // Catalog-driven: a representative model from each tier list maps to the
    // matching picker tier — never hardcoded to a specific model id.
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
    expect(models.every((model) => model.contextWindow > 0)).toBe(true);
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
    expect(options.some((option) => option.id === 'gemini-embedding-2')).toBe(false);
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
    expect(models.map((model) => model.id)).toContain('gpt-5.6-luna');
  });

  it('returns no selectable rows for an unknown runtime profile', () => {
    expect(getPickerModelsForRuntimeProfile('not-a-runtime-profile')).toEqual([]);
  });

  it('composes subscription-tier and runtime-profile admission in one shared selector', () => {
    const basicModels = getModelsForTierAndSurface('basic', 'mobile/cloud-chat');
    const proModels = getModelsForTierAndSurface('pro', 'mobile/cloud-chat');
    const maxModels = getModelsForTierAndSurface('max', 'mobile/cloud-chat');
    const maxPlusModels = getModelsForTierAndSurface('max_plus', 'mobile/cloud-chat');

    expect(basicModels.map((model) => model.id)).toContain('gpt-5.6-luna');
    expect(basicModels.map((model) => model.id)).not.toContain('gpt-5.6-terra');
    expect(basicModels.map((model) => model.id)).toContain('gemini-3.5-flash-lite');
    expect(basicModels.map((model) => model.id)).not.toContain('deepseek-v4-flash');
    expect(basicModels.map((model) => model.id)).not.toContain('qwen-3.7-plus');
    expect(basicModels.map((model) => model.id)).toContain('qwen-3.5-flash');
    expect(basicModels.map((model) => model.id)).not.toContain('glm-5.2');
    expect(basicModels.map((model) => model.id)).not.toContain('sonar');
    expect(proModels.map((model) => model.id)).toContain('gemini-3.5-flash-lite');
    expect(getAllowedModelsForTier('pro_additions')).toEqual(
      expect.arrayContaining(['deepseek-v4-flash', 'qwen-3.7-plus', 'glm-5.2']),
    );
    expect(maxPlusModels).toEqual(maxModels);
    expect(
      getModelsForTierAndSurface('basic', 'desktop/cloud-chat').map((model) => model.id),
    ).toEqual(expect.arrayContaining(['gpt-5.6-luna', 'gemini-3.5-flash-lite']));
    expect(getModelsForTierAndSurface('basic', 'not-a-runtime-profile')).toEqual([]);
  });

  it('keeps Basic on the economy roster while preserving higher-tier inheritance', () => {
    expect(canAccessModelForSubscriptionTier('gpt-5.6-luna', 'basic')).toBe(true);
    expect(canAccessModelForSubscriptionTier('gpt-5.6-terra', 'basic')).toBe(false);
    expect(canAccessModelForSubscriptionTier('gemini-3.5-flash-lite', 'basic')).toBe(true);
    expect(canAccessModelForSubscriptionTier('deepseek-v4-flash', 'basic')).toBe(false);
    expect(canAccessModelForSubscriptionTier('gemini-3.5-flash-lite', 'pro')).toBe(true);
    expect(canAccessModelForSubscriptionTier('claude-opus-5', 'max_plus')).toBe(true);
  });

  it('derives the single selectable Auto from routing policy', () => {
    const profiles = getAutoRoutingProfiles();

    // Collapsed to ONE self-routing "Auto"; the resolver picks the profile per
    // task/tier at request time (economy/balanced/premium are non-selectable).
    expect(profiles.map((profile) => profile.id)).toEqual(['auto']);
    expect(profiles.map((profile) => profile.profile)).toEqual(['balanced']);
    expect(profiles.every((profile) => profile.label.trim().length > 0)).toBe(true);
    expect(profiles.every((profile) => profile.description.trim().length > 0)).toBe(true);
  });

  it('builds context limit and cost maps from canonical ids', () => {
    const aliasId = normalizeModelId('claude-sonnet-5');
    const openaiModel = requireProviderDefaultModel('openai');
    const contextLimits = getModelContextLimits([openaiModel, 'claude-sonnet-5']);
    const costRates = getModelCostRates([openaiModel, 'claude-sonnet-5']);

    expect(aliasId).toBe('claude-sonnet-5');
    // Canonicalization removed: unknown IDs pass through as-is (no legacy redirect).
    expect(normalizeModelId('gpt-5.4-codex-medium')).toBe('gpt-5.4-codex-medium');
    expect(contextLimits[openaiModel]).toBeGreaterThan(0);
    expect(contextLimits['claude-sonnet-5']).toBeGreaterThan(0);
    expect(costRates[openaiModel]).toMatchObject({ provider: 'openai' });
    expect(costRates['claude-sonnet-5']).toMatchObject({ provider: 'anthropic' });
  });

  it('derives provider model lists from the canonical catalog', () => {
    const anthropicIds = getModelIdsForProvider('anthropic', {
      modelTypes: ['chat', 'code', 'reasoning', 'multimodal'],
    });

    expect(anthropicIds).toContain(requireProviderDefaultModel('anthropic'));
    expect(anthropicIds.length).toBeGreaterThan(1);
    expect(anthropicIds).not.toContain('claude-3-haiku-20240307');
  });

  it('projects provider adapter catalogs from the generated provider index', () => {
    const openaiCatalog = getProviderModelCatalog('openai');
    const expectedKeys = modelRegistry.providerModelKeys.openai;

    expect(openaiCatalog.map((model) => model.id)).toEqual(expectedKeys);
    expect(openaiCatalog.every((model) => model.provider === 'openai')).toBe(true);
    expect(openaiCatalog.find((model) => model.id === 'gpt-5.6-luna')).toMatchObject({
      contextWindow: 1_050_000,
      maxOutputTokens: 128_000,
      inputCostPerMillion: 1,
      outputCostPerMillion: 6,
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
    expect(isAutoModeModelId('auto')).toBe(true);
    expect(isAutoModeModelId('AUTO-BALANCED')).toBe(false);
    expect(isAutoModeModelId('gpt-5.6-terra')).toBe(false);
    expect(isAutoModeModelId(null)).toBe(false);
    expect(detectProviderFromModelId('claude-sonnet-5')).toBe('anthropic');
    expect(resolveAutoModeModel('auto-economy', 'free')).toBe('gemini-3.5-flash-lite');
    // Basic/hobby clamp every Auto alias to the economy routing profile.
    expect(resolveAutoModeModel('auto-balanced', 'hobby')).toBe('gemini-3.5-flash-lite');
    expect(resolveAutoModeModel('auto-balanced', 'pro')).toBe('gpt-5.6-terra');
    expect(resolveAutoModeModel('auto-premium', 'max')).toBe(
      modelRegistry.policies.auto.slots.flagship_general.modelKey,
    );
    expect(resolveAutoModeModel('auto-premium', 'free')).toBe('gemini-3.5-flash-lite');
    expect(resolveAutoModeModel('auto-premium', 'hobby')).toBe('gemini-3.5-flash-lite');
  });

  it('derives variant partners, provider probes, and economy fallbacks from the catalog', () => {
    // Variant partners must resolve to a real catalog model (no dangling partner),
    // without pinning the specific partner id.
    expect(getModelMetadataById(getModelVariantPartner('deepseek-v4-flash'))).not.toBeNull();
    expect(getModelMetadataById(getModelVariantPartner('claude-sonnet-5'))).not.toBeNull();
    expect(getProviderProbeModel('openai')).toBe('gpt-5.6-luna');
    expect(getProviderProbeModel('anthropic')).toBe('claude-sonnet-5');

    const fallbackIds = getEconomyFallbackModels().map((entry) => entry.model);
    expect(fallbackIds.indexOf('gemini-3.5-flash-lite')).toBeGreaterThanOrEqual(0);
    expect(fallbackIds).toContain('gpt-5.6-luna');
    expect(fallbackIds).not.toContain('gpt-5.6-terra');

    const coreOptions = getCoreManualModelOptions();
    expect(coreOptions.some((entry) => entry.id === requireProviderDefaultModel('openai'))).toBe(
      true,
    );
    // gpt-5.4-codex was a phantom (never a real OpenAI model) — it may be a
    // migration alias, but must stay absent from picker options.
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.4-codex')).toBe(false);
    expect(coreOptions.some((entry) => entry.id === 'qwen-3.7-plus')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.6-sol')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.6-terra')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.6-luna')).toBe(true);
    // Catalog carries only the latest generation per family (founder policy
    // 2026-07-20): removed compatibility models must not resurface in pickers.
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.4-nano')).toBe(false);
    expect(coreOptions.some((entry) => entry.id === 'sonar-pro')).toBe(false);
  });

  it('legacy removed aliases are not in catalog (canonicalization removed for fresh start)', () => {
    // Canonicalization was removed — unknown aliases return null from getModelMetadataById.
    // gpt-5.6-luna is the current fast OpenAI model; older nano generations were
    // removed from the catalog (founder policy 2026-07-20).
    expect(getModelMetadataById('gpt-5.6-luna')?.id).toBe('gpt-5.6-luna');
    expect(getModelMetadataById('gpt-5.4-nano')).toBeNull();
    expect(getModelMetadataById('gpt-5-nano')).toBeNull();
    expect(normalizeModelId('gpt-5.4-codex-high')).toBe('gpt-5.4-codex-high');
  });

  it('classifies provider surfaces and managed cloud provider visibility', () => {
    expect(getProviderSurface('openai')).toBe('managed_cloud');
    expect(getProviderSurface('managed_cloud')).toBe('managed_cloud');
    expect(getProviderSurface('open_router')).toBe('byok');
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
    expect(getRoutingSlotModel('general_fast')).toBe('gemini-3.5-flash-lite');
    expect(getRoutingSlotModel('general_balanced')).toBe('gpt-5.6-terra');
    expect(getRoutingSlotModel('coding_fast')).toBe('gpt-5.4-mini');
    expect(getModelMetadataById(getRoutingSlotModel('coding_premium'))).not.toBeNull();
    expect(getRoutingSlotModel('search_fast')).toBe('gemini-3.5-flash-lite');
    expect(getRoutingSlotModel('search_premium')).toBe('gemini-3.6-flash');
    expect(getRoutingSlotModel('computer_use')).toBe('claude-sonnet-5');

    expect(canAccessManualModelSelection('free')).toBe(false);
    // Pro now exposes the manual picker behind the Advanced-mode toggle per
    // Basic/hobby carry pro's policy (2026-07-16 ladder): manual picker on.
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
      // Round 13 — Advanced-mode toggle surfaces the manual picker for Pro.
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

// ---------------------------------------------------------------------------
// Pro-tier task-aware routing (resolveAutoModeModel 3-arg signature)
// ---------------------------------------------------------------------------
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
      // Regression: the task-aware path ignored the input model and returned the
      // task slot model, silently swapping an explicit pick (gpt-5.6-terra ->
      // Claude) and re-routing to a provider the user never chose.
      expect(resolveAutoModeModel('gpt-5.6-terra', 'pro', 'coding')).toBe('gpt-5.6-terra');
    });
    it('concrete model + reasoning taskType returns the SAME model', () => {
      expect(resolveAutoModeModel('gpt-5.6-terra', 'pro', 'reasoning')).toBe('gpt-5.6-terra');
    });
    it('auto alias still task-routes (control — task routing only applies to auto-*)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'coding')).toBe('claude-sonnet-5');
    });
  });

  describe('Pro tier task-aware routing', () => {
    it('coding task → coding_premium_pro slot (Sonnet 5)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'coding')).toBe('claude-sonnet-5');
    });
    it('reasoning task → reasoning_premium_pro slot (Qwen 3.7 Plus)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'reasoning')).toBe('qwen-3.7-plus');
    });
    it('multimodal task → multimodal_pro slot (Gemini 3.6 Flash)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'multimodal')).toBe('gemini-3.6-flash');
    });
    it('long_context task → long_context_pro slot (Gemini 3.1 Pro)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'long_context')).toBe(
        'gemini-3.1-pro-preview',
      );
    });
    it('general task → general_balanced_pro slot (GPT-5.6 Terra)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'general')).toBe('gpt-5.6-terra');
    });
    it('simple_chat task → general_balanced_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'simple_chat')).toBe('gpt-5.6-terra');
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
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'agentic')).toBe('gpt-5.6-terra');
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
      expect(result).toBe('qwen-3.5-flash');
    });
    it('multimodal → workhorse_general (Flash-Lite handles vision)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'multimodal');
      expect(result).toBe('gemini-3.5-flash-lite');
    });
  });

  describe('Free tier task-aware fallback behavior', () => {
    it('coding → uses the allowed economy coding slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'coding');
      expect(result).toBe(modelRegistry.policies.auto.slots.coding_fast.modelKey);
    });
    it('reasoning → uses the allowed economy reasoning slot', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'reasoning');
      expect(result).toBe('qwen-3.5-flash');
    });
    it('image_generation → falls back to workhorse_general (no media on free)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'image_generation');
      expect(result).toBe('gemini-3.5-flash-lite');
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
    it('Max reasoning + usOnly=true skips Qwen', () => {
      expect(resolveAutoModeModel('auto-balanced', 'max', 'reasoning')).toBe('qwen-3.7-plus');
      // With usOnly: skips Moonshot/DeepSeek/Zhipu/MiniMax/Qwen.
      const result = resolveAutoModeModel('auto-balanced', 'max', 'reasoning', {
        usOnly: true,
      });
      expect(result).not.toBe('qwen-3.7-plus');
      expect(result).not.toBe('deepseek-v4-flash');
      expect(result).not.toBe('glm-4.7');
    });

    it('Max reasoning + usOnly=true also skips Qwen', () => {
      const result = resolveAutoModeModel('auto-balanced', 'max', 'reasoning', { usOnly: true });
      expect(result).not.toBe('qwen-3.7-plus');
    });

    it('Pro tier ignores usOnly flag (toggle gated by usOnlyRoutingAvailable)', () => {
      // Pro tier policy does not set usOnlyRoutingAvailable, so the flag is
      // ignored and reasoning still routes to Qwen 3.7 Plus.
      const result = resolveAutoModeModel('auto-balanced', 'pro', 'reasoning', { usOnly: true });
      expect(result).toBe('qwen-3.7-plus');
    });

    it('Free tier reasoning with usOnly=true is ignored (toggle not available)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'reasoning', { usOnly: true });
      expect(result).toBe('qwen-3.5-flash');
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

  it('pro reasoning resolves to reasoning_premium_pro (Qwen 3.7 Plus)', () => {
    expect(getDefaultModelFor('pro', 'reasoning')).toBe(
      getRoutingSlotModel('reasoning_premium_pro'),
    );
  });

  it('pro computer-use resolves to computer_use slot (Sonnet 5) — premium slot is Pro+ only', () => {
    expect(getDefaultModelFor('pro', 'computer-use')).toBe(getRoutingSlotModel('computer_use'));
  });

  it('max computer-use resolves to computer_use_premium (Opus 5)', () => {
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
    // The whole point of this helper is to read models.json via SLOT_REGISTRY.
    // Spot-check that the returned IDs are present in the catalog by round-
    // tripping through getRoutingSlotModel and matching exactly.
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

// ---------------------------------------------------------------------------
// R26: groq + mistral provider removal — retired IDs redirect via canonicalization
// ---------------------------------------------------------------------------
describe('R26 provider removal — retired groq/mistral/open_router IDs redirect to fallback models', () => {
  it('groq-llama-3.3-70b (groq provider removed) canonicalizes to the Gemini fallback', () => {
    const meta = getModelMetadataById('groq-llama-3.3-70b');
    expect(meta).not.toBeNull();
    expect(meta?.id).toBe('gemini-3.5-flash-lite');
    expect(meta?.provider).toBe('google');
  });

  it('groq-llama-3.1-8b canonicalizes to the same Gemini fallback', () => {
    const meta = getModelMetadataById('groq-llama-3.1-8b');
    expect(meta).not.toBeNull();
    expect(meta?.id).toBe('gemini-3.5-flash-lite');
  });

  it('mistral-large-3 (mistral provider removed) canonicalizes to the Claude Sonnet 5 fallback', () => {
    const meta = getModelMetadataById('mistral-large-3');
    expect(meta).not.toBeNull();
    expect(meta?.id).toBe('claude-sonnet-5');
  });

  it('mistral-small-4 canonicalizes to the Claude Sonnet 5 fallback', () => {
    const meta = getModelMetadataById('mistral-small-4');
    expect(meta).not.toBeNull();
    expect(meta?.id).toBe('claude-sonnet-5');
  });

  it('codestral-2508 canonicalizes to the Claude Sonnet 5 fallback; the bare pre-rename id stays gone', () => {
    const meta = getModelMetadataById('codestral-2508');
    expect(meta).not.toBeNull();
    expect(meta?.id).toBe('claude-sonnet-5');
    // The bare pre-rename id has no canonicalization entry and was never aliased.
    expect(getModelMetadataById('codestral-2')).toBeNull();
  });

  it('the retired OpenRouter free Nemotron 120B slug canonicalizes to the Gemini fallback', () => {
    // The older 49B Llama-Nemotron free slug was retired with no redirect and stays null.
    const correct = getModelMetadataById('nvidia/nemotron-3-super-120b-a12b:free');
    const retired = getModelMetadataById('nvidia/llama-3.3-nemotron-super-49b-v1:free');
    expect(correct).not.toBeNull();
    expect(correct?.id).toBe('gemini-3.5-flash-lite');
    expect(retired).toBeNull();
  });

  it('the retired OpenRouter free Gemma-4 slug canonicalizes to the Gemini fallback', () => {
    const meta = getModelMetadataById('google/gemma-4-26b-a4b-it:free');
    expect(meta).not.toBeNull();
    expect(meta?.id).toBe('gemini-3.5-flash-lite');
  });

  it('unknown model ID returns null gracefully (no throw)', () => {
    expect(getModelMetadataById('fake-model-that-does-not-exist')).toBeNull();
    expect(getModelMetadataById(null)).toBeNull();
    expect(getModelMetadataById(undefined)).toBeNull();
  });
});

describe('model env-gating (requiresEnvironment)', () => {
  it('SAFETY: no current model declares requiresEnvironment (Phase A is a pure no-op)', () => {
    // The env-gating schema must change behavior for ZERO current models. The first
    // env-gated model is introduced later (with E2B), not in this additive phase.
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
      // Availability is irrelevant for an unconstrained model.
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
      // Configured but unreachable → still locked.
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
    // Regression test for a parity bug (2026-07-02): the chat-completions
    // request-processor only injects the provider-native web_search tool when
    // `capabilities.search` is true (a false value short-circuits the `??`
    // fallback, so the tool is silently never offered). All three Anthropic
    // models had `search: false` in the catalog even though
    // apps/web/lib/llm-providers/anthropic.ts has full wire-format support for
    // Anthropic's server-managed web_search tool — making that code path
    // permanently dead for every Claude model. Assert the fix stays in place.
    it('every current-generation Anthropic model advertises search support', () => {
      for (const modelId of ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5']) {
        const metadata = getModelMetadataById(modelId);
        expect(metadata, `missing catalog entry for ${modelId}`).not.toBeNull();
        expect(metadata!.capabilities.search, `${modelId} capabilities.search`).toBe(true);
      }
    });
  });
});
