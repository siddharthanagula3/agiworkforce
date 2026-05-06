import { describe, expect, it } from 'vitest';
import {
  canAccessManualModelSelection,
  getCoreManualModelOptions,
  getManagedCloudProviderIds,
  detectProviderFromModelId,
  getModelCostRates,
  getModelContextLimits,
  getEconomyFallbackModels,
  getModelIdsForProvider,
  getModelVariantPartner,
  getPickerModelTier,
  getPickerModels,
  getProviderSurface,
  getProviderProbeModel,
  getRoutingSlotModel,
  getTierPolicy,
  listCanonicalModels,
  normalizeModelId,
  resolveAutoModeModel,
} from '../model-catalog';

describe('model catalog helpers', () => {
  it('lists canonical models without alias duplication', () => {
    const models = listCanonicalModels();
    const ids = new Set(models.map((model) => model.id));

    expect(models.length).toBe(ids.size);
    expect(ids.has('gpt-5.4')).toBe(true);
    expect(ids.has('claude-sonnet-4.6')).toBe(true);
  });

  it('maps allowed models into picker-friendly tiers', () => {
    expect(getPickerModelTier('gpt-5.4-mini')).toBe('economy');
    expect(getPickerModelTier('gpt-5.4')).toBe('balanced');
    expect(getPickerModelTier('claude-opus-4.6')).toBe('premium');
  });

  it('returns normalized picker models for chat surfaces', () => {
    const models = getPickerModels({
      allowedProviders: ['openai', 'anthropic', 'google'],
    });

    expect(models.find((model) => model.id === 'gpt-5.4')).toMatchObject({
      provider: 'openai',
      tier: 'balanced',
    });
    expect(models.find((model) => model.id === 'claude-opus-4.7')).toMatchObject({
      provider: 'anthropic',
      tier: 'premium',
    });
    expect(models.every((model) => model.contextWindow > 0)).toBe(true);
  });

  it('builds context limit and cost maps from canonical ids', () => {
    const aliasId = normalizeModelId('claude-sonnet-4-6');
    const codexId = normalizeModelId('gpt-5.4-codex-medium');
    const contextLimits = getModelContextLimits(['gpt-5.4', 'claude-sonnet-4-6']);
    const costRates = getModelCostRates(['gpt-5.4', 'claude-sonnet-4-6']);

    expect(aliasId).toBe('claude-sonnet-4.6');
    expect(codexId).toBe('gpt-5.4-codex');
    expect(contextLimits['gpt-5.4']).toBeGreaterThan(0);
    expect(contextLimits['claude-sonnet-4.6']).toBeGreaterThan(0);
    expect(costRates['gpt-5.4']).toMatchObject({ provider: 'openai' });
    expect(costRates['claude-sonnet-4.6']).toMatchObject({ provider: 'anthropic' });
  });

  it('derives provider model lists from the canonical catalog', () => {
    const anthropicIds = getModelIdsForProvider('anthropic', {
      modelTypes: ['chat', 'code', 'reasoning', 'multimodal'],
    });

    expect(anthropicIds).toContain('claude-sonnet-4.6');
    expect(anthropicIds).toContain('claude-opus-4.6');
    expect(anthropicIds).not.toContain('claude-3-haiku-20240307');
  });

  it('detects providers and resolves auto modes from shared routing defaults', () => {
    expect(detectProviderFromModelId('claude-sonnet-4-6')).toBe('anthropic');
    expect(resolveAutoModeModel('auto-economy', 'hobby')).toBe('gemini-3.1-flash-lite');
    expect(resolveAutoModeModel('auto-balanced', 'pro')).toBe('gpt-5.4-mini');
    expect(resolveAutoModeModel('auto-premium', 'max')).toBe('gemini-3.1-pro-preview');
    expect(resolveAutoModeModel('auto-premium', 'hobby')).toBe('gemini-3.1-flash-lite');
  });

  it('derives variant partners, provider probes, and economy fallbacks from the catalog', () => {
    expect(getModelVariantPartner('gpt-5.4-mini')).toBe('gpt-5.4');
    expect(getModelVariantPartner('claude-sonnet-4-6')).toBe('claude-opus-4.6');
    expect(getProviderProbeModel('openai')).toBe('gpt-5.4-mini');
    expect(getProviderProbeModel('anthropic')).toBe('claude-haiku-4.5');

    const fallbackIds = getEconomyFallbackModels().map((entry) => entry.model);
    expect(fallbackIds.indexOf('qwen-3.6-plus')).toBeGreaterThanOrEqual(0);
    expect(fallbackIds.indexOf('qwen-3.6-plus')).toBeLessThan(fallbackIds.indexOf('gpt-5.4-mini'));
    expect(fallbackIds).toContain('gpt-5.4-mini');
    expect(fallbackIds).not.toContain('gpt-5.4-nano');

    const coreOptions = getCoreManualModelOptions();
    expect(coreOptions.find((entry) => entry.id === 'gpt-5.4-pro')?.label).toBe('GPT-5.4 Pro');
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.4-codex')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'kimi-k2.6')).toBe(true);
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.4-nano')).toBe(false);
    expect(coreOptions.some((entry) => entry.id === 'sonar-pro')).toBe(false);
  });

  it('canonicalizes legacy gpt-5-nano onto gpt-5.4-nano (kept as distinct model)', () => {
    // The catalog refresh in 3129aa408 promoted nano to its own model tier
    // rather than collapsing it onto mini. Canonicalization preserves the
    // distinction; gpt-5-nano (legacy) maps to gpt-5.4-nano (current).
    expect(normalizeModelId('gpt-5-nano')).toBe('gpt-5.4-nano');
    expect(normalizeModelId('gpt-5.4-nano')).toBe('gpt-5.4-nano');
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
    expect(getRoutingSlotModel('coding_fast')).toBe('deepseek-chat');
    expect(getRoutingSlotModel('coding_premium')).toBe('gpt-5.4-codex');
    expect(getRoutingSlotModel('search_fast')).toBe('sonar');
    expect(getRoutingSlotModel('search_premium')).toBe('sonar-deep-research');
    expect(getRoutingSlotModel('computer_use')).toBe('claude-sonnet-4.6');

    expect(canAccessManualModelSelection('free')).toBe(false);
    expect(canAccessManualModelSelection('pro')).toBe(false);
    expect(canAccessManualModelSelection('max')).toBe(true);
    expect(canAccessManualModelSelection('enterprise')).toBe(true);

    expect(getTierPolicy('hobby')).toMatchObject({
      surfacedUx: 'auto_only',
      manualModelSelection: false,
      allowSearch: true,
      allowMediaGeneration: false,
    });
    expect(getTierPolicy('pro')).toMatchObject({
      surfacedUx: 'auto_only',
      manualModelSelection: false,
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
