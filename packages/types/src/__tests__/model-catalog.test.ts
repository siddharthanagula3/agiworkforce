import { describe, expect, it } from 'vitest';
import {
  canAccessManualModelSelection,
  getCoreManualModelOptions,
  getDefaultModelFor,
  getManagedCloudProviderIds,
  detectProviderFromModelId,
  getModelCostRates,
  getModelContextLimits,
  getEconomyFallbackModels,
  getModelIdsForProvider,
  getModelMetadataById,
  getModelVariantPartner,
  getPickerModelTier,
  getPickerModels,
  getProviderSurface,
  getProviderProbeModel,
  getRoutingSlotModel,
  getTierPolicy,
  listCanonicalModels,
  modelsCatalog,
  normalizeModelId,
  requireProviderDefaultModel,
  resolveAutoModeModel,
} from '../model-catalog';

describe('model catalog helpers', () => {
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

  it('builds context limit and cost maps from canonical ids', () => {
    const aliasId = normalizeModelId('claude-sonnet-4-6');
    const codexId = normalizeModelId('gpt-5.4-codex-medium');
    const openaiModel = requireProviderDefaultModel('openai');
    const contextLimits = getModelContextLimits([openaiModel, 'claude-sonnet-4-6']);
    const costRates = getModelCostRates([openaiModel, 'claude-sonnet-4-6']);

    expect(aliasId).toBe('claude-sonnet-4.6');
    // Legacy phantom Codex selections are non-selectable, but saved chats/config
    // migrate forward to the current OpenAI flagship.
    expect(codexId).toBe(requireProviderDefaultModel('openai'));
    expect(getModelMetadataById(codexId)).toMatchObject({ provider: 'openai' });
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

  it('detects providers and resolves auto modes from shared routing defaults', () => {
    expect(detectProviderFromModelId('claude-sonnet-4-6')).toBe('anthropic');
    expect(resolveAutoModeModel('auto-economy', 'hobby')).toBe('gemini-3.1-flash-lite');
    expect(resolveAutoModeModel('auto-balanced', 'pro')).toBe('gpt-5.4-mini');
    expect(resolveAutoModeModel('auto-premium', 'max')).toBe('gemini-3.5-flash');
    expect(resolveAutoModeModel('auto-premium', 'hobby')).toBe('gemini-3.1-flash-lite');
  });

  it('derives variant partners, provider probes, and economy fallbacks from the catalog', () => {
    // Variant partners must resolve to a real catalog model (no dangling partner),
    // without pinning the specific partner id.
    expect(getModelMetadataById(getModelVariantPartner('gpt-5.4-mini'))).not.toBeNull();
    expect(getModelMetadataById(getModelVariantPartner('claude-sonnet-4-6'))).not.toBeNull();
    expect(getProviderProbeModel('openai')).toBe('gpt-5.4-mini');
    expect(getProviderProbeModel('anthropic')).toBe('claude-haiku-4.5');

    const fallbackIds = getEconomyFallbackModels().map((entry) => entry.model);
    expect(fallbackIds.indexOf('qwen-3.6-plus')).toBeGreaterThanOrEqual(0);
    expect(fallbackIds.indexOf('qwen-3.6-plus')).toBeLessThan(fallbackIds.indexOf('gpt-5.4-mini'));
    expect(fallbackIds).toContain('gpt-5.4-mini');
    expect(fallbackIds).not.toContain('gpt-5.4-nano');

    const coreOptions = getCoreManualModelOptions();
    expect(coreOptions.some((entry) => entry.id === requireProviderDefaultModel('openai'))).toBe(
      true,
    );
    // gpt-5.4-codex was a phantom (never a real OpenAI model) — it may be a
    // migration alias, but must stay absent from picker options.
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.4-codex')).toBe(false);
    expect(coreOptions.some((entry) => entry.id === 'kimi-k2.6')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.4-nano')).toBe(false);
    expect(coreOptions.some((entry) => entry.id === 'sonar-pro')).toBe(false);
  });

  it('migrates legacy removed aliases without making them selectable', () => {
    expect(getModelMetadataById('gpt-5-nano')).toBeNull();
    expect(getModelMetadataById('gpt-5.4-nano')).toMatchObject({ id: 'gpt-5.4-mini' });
    expect(normalizeModelId('gpt-5.4-codex-high')).toBe(requireProviderDefaultModel('openai'));
  });

  it('classifies provider surfaces and managed cloud provider visibility', () => {
    expect(getProviderSurface('openai')).toBe('managed_cloud');
    expect(getProviderSurface('managed_cloud')).toBe('managed_cloud');
    expect(getProviderSurface('open_router')).toBe('byok');
    expect(getProviderSurface('nvidia_nim')).toBe('byok');
    expect(getProviderSurface('ollama')).toBe('local');
    expect(getProviderSurface('groq')).toBe('hidden');

    expect(getManagedCloudProviderIds()).toEqual([
      'openai',
      'anthropic',
      'google',
      'xai',
      'qwen',
      'moonshot',
      'deepseek',
      'perplexity',
      'zhipu',
    ]);
    expect(getManagedCloudProviderIds({ includeSearchProviders: false })).toEqual([
      'openai',
      'anthropic',
      'google',
      'xai',
      'qwen',
      'moonshot',
      'deepseek',
      'zhipu',
    ]);
  });

  it('defines tier policy and slot routing from one shared source', () => {
    expect(getRoutingSlotModel('general_fast')).toBe('gemini-3.1-flash-lite');
    expect(getRoutingSlotModel('general_balanced')).toBe('gpt-5.4-mini');
    expect(getRoutingSlotModel('coding_fast')).toBe('deepseek-v4-flash');
    expect(getModelMetadataById(getRoutingSlotModel('coding_premium'))).not.toBeNull();
    expect(getRoutingSlotModel('search_fast')).toBe('sonar');
    expect(getRoutingSlotModel('search_premium')).toBe('sonar-deep-research');
    expect(getRoutingSlotModel('computer_use')).toBe('claude-sonnet-4.6');

    expect(canAccessManualModelSelection('free')).toBe(false);
    // Pro now exposes the manual picker behind the Advanced-mode toggle per
    // parallel-spinning-hedgehog §6 (Round 13). Free + Hobby remain Auto-only.
    expect(canAccessManualModelSelection('hobby')).toBe(false);
    expect(canAccessManualModelSelection('pro')).toBe(true);
    expect(canAccessManualModelSelection('max')).toBe(true);
    expect(canAccessManualModelSelection('enterprise')).toBe(true);

    expect(getTierPolicy('hobby')).toMatchObject({
      surfacedUx: 'auto_only',
      manualModelSelection: false,
      allowSearch: true,
      // Hobby permits image generation (10/mo) per auto-routing-spec §1.
      allowMediaGeneration: true,
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

  describe('Pro tier task-aware routing', () => {
    it('coding task → coding_premium_pro slot (Sonnet 4.6)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'coding')).toBe('claude-sonnet-4.6');
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
    it('general task → general_balanced_pro slot (GPT-5.4 mini)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'general')).toBe('gpt-5.4-mini');
    });
    it('simple_chat task → general_balanced_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'simple_chat')).toBe('gpt-5.4-mini');
    });
    it('creative_writing → general_balanced_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'creative_writing')).toBe('gpt-5.4-mini');
    });
    it('research → general_balanced_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'research')).toBe('gpt-5.4-mini');
    });
    it('agentic → general_balanced_pro slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro', 'agentic')).toBe('gpt-5.4-mini');
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

  describe('Hobby tier task-aware routing (separate from Pro map)', () => {
    it('coding → escalation_coding slot (GLM-5.1), NOT coding_premium_pro', () => {
      const result = resolveAutoModeModel('auto-balanced', 'hobby', 'coding');
      expect(result).toBe('glm-5.1');
      expect(result).not.toBe('claude-sonnet-4.6');
    });
    it('reasoning → reasoning_premium slot (DeepSeek V4 Flash), NOT reasoning_premium_pro', () => {
      const result = resolveAutoModeModel('auto-balanced', 'hobby', 'reasoning');
      expect(result).toBe('deepseek-v4-flash');
      expect(result).not.toBe('kimi-k2.6');
    });
    it('multimodal → workhorse_general slot (Flash-Lite handles vision)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'hobby', 'multimodal');
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

  describe('Max + Enterprise tier task-aware routing (shares Pro+ map with flagship access)', () => {
    it('Max coding → flagship_coding_pro_plus slot', () => {
      // Max shares the Pro+ map, which routes coding → flagship_coding_pro_plus.
      // Max's allowedSlots include the flagship slots (with monthly cap of 1M
      // tokens enforced by assertQuota; no daily cap like Pro+).
      expect(resolveAutoModeModel('auto-balanced', 'max', 'coding')).toBe(
        getRoutingSlotModel('flagship_coding_pro_plus'),
      );
    });
    it('Enterprise coding → flagship_coding_pro_plus slot', () => {
      expect(resolveAutoModeModel('auto-balanced', 'enterprise', 'coding')).toBe(
        getRoutingSlotModel('flagship_coding_pro_plus'),
      );
    });
    it('Pro+ coding → flagship_coding_pro_plus slot (gated by 15K daily cap)', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro_plus', 'coding')).toBe(
        getRoutingSlotModel('flagship_coding_pro_plus'),
      );
    });
    it('Pro+ general → flagship_general_pro_plus → gpt-5.5', () => {
      expect(resolveAutoModeModel('auto-balanced', 'pro_plus', 'general')).toBe('gpt-5.5');
    });
  });

  describe('US-only routing toggle (Pro+/Max only)', () => {
    it('Pro+ reasoning + usOnly=true skips kimi-k2.6 (Moonshot)', () => {
      // Default: reasoning -> reasoning_premium_pro -> kimi-k2.6
      expect(resolveAutoModeModel('auto-balanced', 'pro_plus', 'reasoning')).toBe('kimi-k2.6');
      // With usOnly: skips Moonshot/DeepSeek/Zhipu/MiniMax/Qwen.
      const result = resolveAutoModeModel('auto-balanced', 'pro_plus', 'reasoning', {
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

    it('Hobby reasoning with usOnly=true is ignored (toggle not available)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'hobby', 'reasoning', { usOnly: true });
      expect(result).toBe('deepseek-v4-flash');
    });

    it('Pro+ coding with usOnly=true stays on the flagship coding slot (Anthropic is US)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'pro_plus', 'coding', { usOnly: true });
      expect(result).toBe(getRoutingSlotModel('flagship_coding_pro_plus'));
    });

    it('Pro+ general with usOnly=true keeps gpt-5.5 (OpenAI is US)', () => {
      const result = resolveAutoModeModel('auto-balanced', 'pro_plus', 'general', { usOnly: true });
      expect(result).toBe('gpt-5.5');
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

  it('hobby chat falls back through preference list to workhorse_general (no general_balanced* allowed)', () => {
    expect(getDefaultModelFor('hobby', 'chat')).toBe(getRoutingSlotModel('workhorse_general'));
  });

  it('hobby fast-status uses workhorse fallback (general_fast slot not in hobby allowedSlots)', () => {
    expect(getDefaultModelFor('hobby', 'fast-status')).toBe(
      getRoutingSlotModel('workhorse_general'),
    );
  });

  it('hobby reasoning resolves to reasoning_premium (Pool B reasoning lane)', () => {
    expect(getDefaultModelFor('hobby', 'reasoning')).toBe(getRoutingSlotModel('reasoning_premium'));
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

  it('accepts pro_plus (ProductTier extension) and resolves to flagship-adjacent slots', () => {
    // pro_plus is in ProductTier but not in SubscriptionTier — the helper
    // accepts both and resolves through normalizeProductTier.
    expect(getDefaultModelFor('pro_plus', 'chat')).toBe(
      getRoutingSlotModel('general_balanced_pro'),
    );
    expect(getDefaultModelFor('pro_plus', 'computer-use')).toBe(
      getRoutingSlotModel('computer_use_premium'),
    );
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
