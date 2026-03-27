import { describe, expect, it } from 'vitest';
import {
  getCoreManualModelOptions,
  detectProviderFromModelId,
  getModelCostRates,
  getModelContextLimits,
  getEconomyFallbackModels,
  getModelIdsForProvider,
  getModelVariantPartner,
  getPickerModelTier,
  getPickerModels,
  getProviderProbeModel,
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
    expect(models.find((model) => model.id === 'claude-opus-4.6')).toMatchObject({
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
    expect(resolveAutoModeModel('auto-economy', 'hobby')).toBe('gpt-5.4-mini');
    expect(resolveAutoModeModel('auto-balanced', 'pro')).toBe('gpt-5.4');
    expect(resolveAutoModeModel('auto-premium', 'max')).toBe('claude-opus-4.6');
    expect(resolveAutoModeModel('auto-premium', 'hobby')).toBe('gpt-5.4-mini');
  });

  it('derives variant partners, provider probes, and economy fallbacks from the catalog', () => {
    expect(getModelVariantPartner('gpt-5.4-mini')).toBe('gpt-5.4');
    expect(getModelVariantPartner('claude-sonnet-4-6')).toBe('claude-opus-4.6');
    expect(getProviderProbeModel('openai')).toBe('gpt-5.4-mini');
    expect(getProviderProbeModel('anthropic')).toBe('claude-haiku-4.5');

    const fallbackIds = getEconomyFallbackModels().map((entry) => entry.model);
    expect(fallbackIds.indexOf('qwen-turbo')).toBeGreaterThanOrEqual(0);
    expect(fallbackIds.indexOf('qwen-turbo')).toBeLessThan(fallbackIds.indexOf('gpt-5.4-mini'));
    expect(fallbackIds).toContain('gpt-5.4-mini');
    expect(fallbackIds).not.toContain('gpt-5.4-nano');

    const coreOptions = getCoreManualModelOptions();
    expect(coreOptions.find((entry) => entry.id === 'gpt-5.4-pro')?.label).toBe('GPT-5.4 Pro');
    expect(coreOptions.some((entry) => entry.id === 'gpt-5.4-nano')).toBe(false);
  });
});
