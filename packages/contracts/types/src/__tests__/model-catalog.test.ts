import { describe, expect, it } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';
import {
  canAccessManualModelSelection,
  evaluateModelEnvironment,
  MODEL_ENVIRONMENTS,
  getCoreManualModelOptions,
  getAutoRoutingProfiles,
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
  getProviderSurface,
  getProviderProbeModel,
  getProviderModelCatalog,
  getProvidersWithImplementedHarnessFeature,
  getRoutingSlotModel,
  getTierPolicy,
  listCanonicalModels,
  modelsCatalog,
  normalizeModelId,
  requireProviderDefaultModel,
  resolveAutoModeModel,
  SLOT_REGISTRY,
} from '../model-catalog';

describe('model catalog helpers', () => {
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

  it('returns no selectable rows for an unavailable runtime profile', () => {
    expect(getPickerModelsForRuntimeProfile('desktop/cloud-chat')).toEqual([]);
    expect(getPickerModelsForRuntimeProfile('not-a-runtime-profile')).toEqual([]);
  });

  it('derives selectable Auto profiles and presentation from routing policy', () => {
    const profiles = getAutoRoutingProfiles();

    expect(profiles.map((profile) => profile.id)).toEqual([
      'auto-economy',
      'auto-balanced',
      'auto-premium',
    ]);
    expect(profiles.map((profile) => profile.profile)).toEqual(['economy', 'balanced', 'premium']);
    expect(profiles.every((profile) => profile.label.trim().length > 0)).toBe(true);
    expect(profiles.every((profile) => profile.description.trim().length > 0)).toBe(true);
  });

  it('builds context limit and cost maps from canonical ids', () => {
    // claude-sonnet-4-6 (dash format) resolves to claude-sonnet-4.6 via apiModelId lookup.
    const aliasId = normalizeModelId('claude-sonnet-4-6');
    const openaiModel = requireProviderDefaultModel('openai');
    const contextLimits = getModelContextLimits([openaiModel, 'claude-sonnet-4-6']);
    const costRates = getModelCostRates([openaiModel, 'claude-sonnet-4-6']);

    expect(aliasId).toBe('claude-sonnet-4.6');
    // Canonicalization removed: unknown IDs pass through as-is (no legacy redirect).
    expect(normalizeModelId('gpt-5.4-codex-medium')).toBe('gpt-5.4-codex-medium');
    expect(contextLimits[openaiModel]).toBeGreaterThan(0);
    expect(contextLimits['claude-sonnet-4.6']).toBeGreaterThan(0);
    expect(costRates[openaiModel]).toMatchObject({ provider: 'openai' });
    expect(costRates['claude-sonnet-4.6']).toMatchObject({ provider: 'anthropic' });
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
    expect(openaiCatalog.find((model) => model.id === 'gpt-5.4-nano')).toMatchObject({
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
      inputCostPerMillion: 0.2,
      outputCostPerMillion: 1.25,
      capabilities: { streaming: true, tools: true, vision: true },
    });
    expect(getProviderModelCatalog('not-a-provider')).toEqual([]);
  });

  it('derives provider execution support from generated harness features', () => {
    expect(getProvidersWithImplementedHarnessFeature('webSearchInjection').sort()).toEqual([
      'anthropic',
      'google',
    ]);
    expect(getProvidersWithImplementedHarnessFeature('webSearch').sort()).toEqual([
      'anthropic',
      'google',
      'managed_cloud',
      'perplexity',
    ]);
    expect(getProvidersWithImplementedHarnessFeature('not-a-feature')).toEqual([]);
  });

  it('derives every compatibility routing-slot assignment from the generated registry', () => {
    for (const [slotId, definition] of Object.entries(SLOT_REGISTRY)) {
      const registrySlot = modelRegistry.policies.auto.slots[
        slotId as keyof typeof modelRegistry.policies.auto.slots
      ] as { modelKey: string } | undefined;
      expect(registrySlot, `${slotId} must be registry-owned`).toBeDefined();
      expect(definition.modelId).toBe(registrySlot?.modelKey);
      expect(definition.provider).toBe(
        modelRegistry.models[registrySlot!.modelKey as keyof typeof modelRegistry.models].identity
          .provider,
      );
    }
  });

  it('detects providers and resolves auto modes from shared routing defaults', () => {
    expect(isAutoModeModelId('auto')).toBe(true);
    expect(isAutoModeModelId('AUTO-BALANCED')).toBe(false);
    expect(isAutoModeModelId('gpt-5.4-mini')).toBe(false);
    expect(isAutoModeModelId(null)).toBe(false);
    expect(detectProviderFromModelId('claude-sonnet-4-6')).toBe('anthropic');
    expect(resolveAutoModeModel('auto-economy', 'free')).toBe('gemini-3.1-flash-lite');
    // Basic/hobby resolve exactly like pro (2026-07-16 ladder).
    expect(resolveAutoModeModel('auto-balanced', 'hobby')).toBe(
      resolveAutoModeModel('auto-balanced', 'pro'),
    );
    expect(resolveAutoModeModel('auto-balanced', 'pro')).toBe('gpt-5.6-terra');
    expect(resolveAutoModeModel('auto-premium', 'max')).toBe(
      modelRegistry.policies.auto.slots.flagship_general.modelKey,
    );
    expect(resolveAutoModeModel('auto-premium', 'free')).toBe('gemini-3.1-flash-lite');
    expect(resolveAutoModeModel('auto-premium', 'hobby')).toBe(
      resolveAutoModeModel('auto-premium', 'pro'),
    );
  });

  it('derives variant partners, provider probes, and economy fallbacks from the catalog', () => {
    // Variant partners must resolve to a real catalog model (no dangling partner),
    // without pinning the specific partner id.
    expect(getModelMetadataById(getModelVariantPartner('gpt-5.4-mini'))).not.toBeNull();
    expect(getModelMetadataById(getModelVariantPartner('claude-sonnet-4-6'))).not.toBeNull();
    expect(getProviderProbeModel('openai')).toBe('gpt-5.6-luna');
    expect(getProviderProbeModel('anthropic')).toBe('claude-haiku-4.5');

    const fallbackIds = getEconomyFallbackModels().map((entry) => entry.model);
    expect(fallbackIds.indexOf('qwen-3.5-plus')).toBeGreaterThanOrEqual(0);
    expect(fallbackIds).toContain('gpt-5.6-luna');
    expect(fallbackIds).not.toContain('gpt-5.4-mini');
    expect(fallbackIds).not.toContain('gpt-5.4-nano');

    const coreOptions = getCoreManualModelOptions();
    expect(coreOptions.some((entry) => entry.id === requireProviderDefaultModel('openai'))).toBe(
      true,
    );
    // gpt-5.4-codex was a phantom (never a real OpenAI model) — it may be a
    // migration alias, but must stay absent from picker options.
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.4-codex')).toBe(false);
    expect(coreOptions.some((entry) => entry.id === 'kimi-k2.6')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.6-sol')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.6-terra')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.6-luna')).toBe(true);
    // Still-served compatibility models remain addressable even after leaving
    // the current-provider presets and Auto routing slots.
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.4-nano')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'sonar-pro')).toBe(false);
  });

  it('legacy removed aliases are not in catalog (canonicalization removed for fresh start)', () => {
    // Canonicalization was removed — unknown aliases return null from getModelMetadataById.
    // gpt-5.4-nano is the verified current replacement for legacy gpt-5-nano.
    expect(getModelMetadataById('gpt-5.4-nano')?.id).toBe('gpt-5.4-nano');
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
    expect(getRoutingSlotModel('general_fast')).toBe('gemini-3.1-flash-lite');
    expect(getRoutingSlotModel('general_balanced')).toBe('gpt-5.6-terra');
    expect(getRoutingSlotModel('coding_fast')).toBe('deepseek-v4-flash');
    expect(getModelMetadataById(getRoutingSlotModel('coding_premium'))).not.toBeNull();
    expect(getRoutingSlotModel('search_fast')).toBe('sonar');
    expect(getRoutingSlotModel('search_premium')).toBe('sonar-deep-research');
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
      allowSearch: false,
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
      slots.escalation_coding.modelKey,
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
      // task slot model, silently swapping an explicit pick (gpt-5.4-mini ->
      // Claude) and re-routing to a provider the user never chose.
      expect(resolveAutoModeModel('gpt-5.4-mini', 'pro', 'coding')).toBe('gpt-5.4-mini');
    });
    it('concrete model + reasoning taskType returns the SAME model', () => {
      expect(resolveAutoModeModel('gpt-5.4-mini', 'pro', 'reasoning')).toBe('gpt-5.4-mini');
    });
    it('auto alias still task-routes (control — task routing only applies to auto-*)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'coding')).toBe('claude-sonnet-5');
    });
  });

  describe('Pro tier task-aware routing', () => {
    it('coding task → coding_premium_pro slot (Sonnet 5)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'coding')).toBe('claude-sonnet-5');
    });
    it('reasoning task → reasoning_premium_pro slot (Kimi K2.6)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'reasoning')).toBe('kimi-k2.6');
    });
    it('multimodal task → multimodal_pro slot (Gemini 3.5 Flash)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'multimodal')).toBe('gemini-3.5-flash');
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

  describe('Free tier task-aware routing fallback (all tasks → workhorse_general)', () => {
    it('coding → workhorse_general (escalation_coding not in free allowedSlots)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'coding');
      expect(result).toBe('gemini-3.1-flash-lite');
      expect(result).not.toBe('claude-sonnet-4.6');
    });
    it('reasoning → workhorse_general (reasoning_premium not in free allowedSlots)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'reasoning');
      expect(result).toBe('gemini-3.1-flash-lite');
      expect(result).not.toBe('kimi-k2.6');
    });
    it('multimodal → workhorse_general (Flash-Lite handles vision)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'multimodal');
      expect(result).toBe('gemini-3.1-flash-lite');
    });
  });

  describe('Free tier task-aware routing (allowedSlots restricted to workhorse_general)', () => {
    it('coding → falls back to workhorse_general (escalation_coding not allowed)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'coding');
      expect(result).toBe('gemini-3.1-flash-lite');
    });
    it('reasoning → falls back to workhorse_general', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'reasoning');
      expect(result).toBe('gemini-3.1-flash-lite');
    });
    it('image_generation → falls back to workhorse_general (no media on free)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'image_generation');
      expect(result).toBe('gemini-3.1-flash-lite');
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
    it('Max reasoning + usOnly=true skips kimi-k2.6 (Moonshot)', () => {
      // Default: reasoning -> reasoning_premium_pro -> kimi-k2.6
      expect(resolveAutoModeModel('auto-balanced', 'max', 'reasoning')).toBe('kimi-k2.6');
      // With usOnly: skips Moonshot/DeepSeek/Zhipu/MiniMax/Qwen.
      const result = resolveAutoModeModel('auto-balanced', 'max', 'reasoning', {
        usOnly: true,
      });
      expect(result).not.toBe('kimi-k2.6');
      expect(result).not.toBe('deepseek-v4-flash');
      expect(result).not.toBe('glm-4.7');
    });

    it('Max reasoning + usOnly=true also skips kimi-k2.6', () => {
      const result = resolveAutoModeModel('auto-balanced', 'max', 'reasoning', { usOnly: true });
      expect(result).not.toBe('kimi-k2.6');
    });

    it('Pro tier ignores usOnly flag (toggle gated by usOnlyRoutingAvailable)', () => {
      // Pro tier policy does not set usOnlyRoutingAvailable, so the flag is
      // ignored and reasoning still routes to kimi-k2.6.
      const result = resolveAutoModeModel('auto-balanced', 'pro', 'reasoning', { usOnly: true });
      expect(result).toBe('kimi-k2.6');
    });

    it('Free tier reasoning with usOnly=true is ignored (toggle not available)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'free', 'reasoning', { usOnly: true });
      expect(result).toBe('gemini-3.1-flash-lite');
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

  it('routes free tier voice through workhorse fallback (voice_transcription not allowed)', () => {
    expect(getDefaultModelFor('free', 'voice')).toBe(getRoutingSlotModel('workhorse_general'));
  });

  it('hobby/basic chat mirrors pro (2026-07-16 ladder: budget-differentiated, same slots)', () => {
    expect(getDefaultModelFor('hobby', 'chat')).toBe(getDefaultModelFor('pro', 'chat'));
    expect(getDefaultModelFor('basic', 'chat')).toBe(getDefaultModelFor('pro', 'chat'));
  });

  it('hobby fast-status mirrors pro fast-status', () => {
    expect(getDefaultModelFor('hobby', 'fast-status')).toBe(
      getDefaultModelFor('pro', 'fast-status'),
    );
  });

  it('hobby reasoning mirrors pro reasoning', () => {
    expect(getDefaultModelFor('hobby', 'reasoning')).toBe(getDefaultModelFor('pro', 'reasoning'));
  });

  it('pro chat resolves to general_balanced_pro (preferred Pro slot)', () => {
    expect(getDefaultModelFor('pro', 'chat')).toBe(getRoutingSlotModel('general_balanced_pro'));
  });

  it('pro reasoning resolves to reasoning_premium_pro (Kimi K2.6)', () => {
    expect(getDefaultModelFor('pro', 'reasoning')).toBe(
      getRoutingSlotModel('reasoning_premium_pro'),
    );
  });

  it('pro computer-use resolves to computer_use slot (Sonnet 4.6) — premium slot is Pro+ only', () => {
    expect(getDefaultModelFor('pro', 'computer-use')).toBe(getRoutingSlotModel('computer_use'));
  });

  it('max computer-use resolves to computer_use_premium (Opus 4.7)', () => {
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
// R25-V2: Mistral / Groq / OpenRouter model-id drift verification
// ---------------------------------------------------------------------------
describe('R25-V2 model-id drift — known-good IDs resolve; removed IDs return null', () => {
  it('groq llama-3.3-70b resolves with correct provider and apiModelId', () => {
    const meta = getModelMetadataById('groq-llama-3.3-70b');
    expect(meta).not.toBeNull();
    expect(meta?.provider).toBe('groq');
    expect(meta?.apiModelId).toBe('llama-3.3-70b-versatile');
  });

  it('groq llama-3.1-8b resolves with correct apiModelId', () => {
    const meta = getModelMetadataById('groq-llama-3.1-8b');
    expect(meta).not.toBeNull();
    expect(meta?.apiModelId).toBe('llama-3.1-8b-instant');
  });

  it('mistral-large-3 resolves with correct apiModelId mistral-large-2512', () => {
    const meta = getModelMetadataById('mistral-large-3');
    expect(meta).not.toBeNull();
    expect(meta?.apiModelId).toBe('mistral-large-2512');
  });

  it('mistral-small-3 apiModelId is updated to mistral-small-2603 (Small 4, not deprecated 2506)', () => {
    const meta = getModelMetadataById('mistral-small-3');
    expect(meta).not.toBeNull();
    expect(meta?.apiModelId).toBe('mistral-small-2603');
    expect(meta?.apiModelId).not.toBe('mistral-small-2506');
  });

  it('codestral-2 apiModelId is codestral-2508, not the invalid bare "codestral-2"', () => {
    const meta = getModelMetadataById('codestral-2');
    expect(meta).not.toBeNull();
    expect(meta?.apiModelId).toBe('codestral-2508');
    expect(meta?.apiModelId).not.toBe('codestral-2');
  });

  it('openrouter nvidia model is the correct 49B nemotron ID, not the hallucinated 120B ID', () => {
    const correct = getModelMetadataById('nvidia/llama-3.3-nemotron-super-49b-v1:free');
    const hallucinated = getModelMetadataById('nvidia/nemotron-3-super-120b-a12b:free');
    expect(correct).not.toBeNull();
    expect(correct?.provider).toBe('open_router');
    expect(hallucinated).toBeNull();
  });

  it('mistralai openrouter free model has 128K context (not the old 32K)', () => {
    const meta = getModelMetadataById('mistralai/mistral-small-3.1-24b-instruct:free');
    expect(meta).not.toBeNull();
    expect(meta?.contextWindow).toBe(128000);
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
      for (const modelId of ['claude-opus-4.8', 'claude-sonnet-4.6', 'claude-haiku-4.5']) {
        const metadata = getModelMetadataById(modelId);
        expect(metadata, `missing catalog entry for ${modelId}`).not.toBeNull();
        expect(metadata!.capabilities.search, `${modelId} capabilities.search`).toBe(true);
      }
    });
  });
});
