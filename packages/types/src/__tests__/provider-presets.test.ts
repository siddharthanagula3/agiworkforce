import { describe, expect, it } from 'vitest';

import {
  CUSTOM_OPENAI_COMPATIBLE_PROVIDER_PRESET_IDS,
  getProviderPreset,
  getRecommendedProviderPresetsForGoal,
  listCustomOpenAICompatibleProviderPresets,
  listOpenAICompatibleProviderPresets,
  listProviderPresets,
  listProviderStreamProviderPresets,
  PROVIDER_PRESET_IDS,
  PROVIDER_PRESETS,
  PROVIDER_STREAM_PROVIDER_PRESET_IDS,
} from '../provider-presets';

describe('provider presets', () => {
  it('contains every exported preset id', () => {
    expect(PROVIDER_PRESET_IDS).toEqual(Object.keys(PROVIDER_PRESETS));
  });

  it('keeps first-wave providers explicit', () => {
    expect(PROVIDER_PRESETS.open_router.rolloutTier).toBe('first_wave_native');
    expect(PROVIDER_PRESETS.groq.rolloutTier).toBe('first_wave_native');
    expect(PROVIDER_PRESETS.mistral.rolloutTier).toBe('first_wave_native');
    expect(PROVIDER_PRESETS.azure.rolloutTier).toBe('first_wave_native');
    expect(PROVIDER_PRESETS.bedrock.rolloutTier).toBe('first_wave_native');
  });

  it('keeps preset hosts on OpenAI-compatible endpoints', () => {
    expect(PROVIDER_PRESETS.together.endpoint?.baseUrl).toBe('https://api.together.ai/v1');
    expect(PROVIDER_PRESETS.fireworks.endpoint?.baseUrl).toBe(
      'https://api.fireworks.ai/inference/v1',
    );
    expect(PROVIDER_PRESETS.huggingface.endpoint?.baseUrl).toBe('https://router.huggingface.co/v1');
  });

  it('treats Azure and Bedrock as enterprise setup flows', () => {
    expect(getProviderPreset('azure')?.endpoint).toBeUndefined();
    expect(getProviderPreset('bedrock')?.endpoint).toBeUndefined();
    expect(PROVIDER_PRESETS.azure.setupFields?.map((field) => field.id)).toContain('deployment');
    expect(PROVIDER_PRESETS.bedrock.setupFields?.map((field) => field.id)).toContain('region');
  });

  it('hides deprioritized providers by default', () => {
    expect(listProviderPresets().map((preset) => preset.id)).not.toContain('replicate');
    expect(
      listProviderPresets({ includeDeprioritized: true }).map((preset) => preset.id),
    ).toContain('replicate');
  });

  it('returns stable goal recommendations', () => {
    expect(getRecommendedProviderPresetsForGoal('start_free').map((preset) => preset.id)).toEqual([
      'google',
      'groq',
      'mistral',
      'open_router',
      'cohere',
    ]);

    expect(
      getRecommendedProviderPresetsForGoal('enterprise_account')
        .slice(0, 2)
        .map((preset) => preset.id),
    ).toEqual(['azure', 'bedrock']);
  });

  it('lists configured OpenAI-compatible endpoints for preset-driven forms', () => {
    const endpointIds = listOpenAICompatibleProviderPresets().map((preset) => preset.id);
    expect(endpointIds).toContain('open_router');
    expect(endpointIds).toContain('groq');
    expect(endpointIds).toContain('mistral');
    expect(endpointIds).toContain('together');
    expect(endpointIds).toContain('fireworks');
    expect(endpointIds).toContain('huggingface');
  });

  it('lists custom endpoint presets in the UI order', () => {
    expect(listCustomOpenAICompatibleProviderPresets().map((preset) => preset.id)).toEqual(
      CUSTOM_OPENAI_COMPATIBLE_PROVIDER_PRESET_IDS,
    );
  });

  it('lists provider-stream runtime providers separately from setup-only providers', () => {
    expect(listProviderStreamProviderPresets().map((preset) => preset.id)).toEqual(
      PROVIDER_STREAM_PROVIDER_PRESET_IDS,
    );
    expect(PROVIDER_STREAM_PROVIDER_PRESET_IDS).toContain('open_router');
    expect(PROVIDER_STREAM_PROVIDER_PRESET_IDS).toContain('groq');
    expect(PROVIDER_STREAM_PROVIDER_PRESET_IDS).toContain('mistral');
    expect(PROVIDER_STREAM_PROVIDER_PRESET_IDS).not.toContain('azure');
    expect(PROVIDER_STREAM_PROVIDER_PRESET_IDS).not.toContain('bedrock');
    expect(PROVIDER_STREAM_PROVIDER_PRESET_IDS).not.toContain('cohere');
    expect(PROVIDER_STREAM_PROVIDER_PRESET_IDS).not.toContain('huggingface');
  });

  it('looks up known presets and rejects unknown ids', () => {
    expect(getProviderPreset('open_router')?.label).toBe('OpenRouter');
    expect(getProviderPreset('openrouter')).toBeNull();
  });
});
