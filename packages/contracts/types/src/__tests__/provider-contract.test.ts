import { describe, it, expect } from 'vitest';
import {
  modelsCatalog,
  getProviderSurface,
  getModelMetadataById,
  requireProviderDefaultModel,
  type ProviderSurface,
} from '../model-catalog';

const VALID_SURFACES: readonly ProviderSurface[] = ['managed_cloud', 'byok', 'local', 'hidden'];
const providerIds = Object.keys(modelsCatalog.providers);

describe('provider contract · surface classification', () => {
  it('classifies every catalogued provider into exactly one valid surface', () => {
    expect(providerIds.length).toBeGreaterThan(0);
    for (const id of providerIds) {
      const surface = getProviderSurface(id);
      expect(VALID_SURFACES, `provider ${id} → ${surface}`).toContain(surface);
    }
  });

  it('never classifies a BYOK or Local provider as managed_cloud (trust boundary)', () => {
    for (const id of providerIds) {
      const surface = getProviderSurface(id);
      if (surface === 'byok' || surface === 'local') {
        expect(surface, `${id} must not be managed_cloud`).not.toBe('managed_cloud');
      }
    }
    expect(getProviderSurface('open_router')).toBe('managed_cloud');
    expect(getProviderSurface('nvidia_nim')).toBe('byok');
    expect(getProviderSurface('ollama')).toBe('local');
    expect(getProviderSurface('openai')).toBe('managed_cloud');
    expect(getProviderSurface('anthropic')).toBe('managed_cloud');
  });
});

describe('provider contract · referential integrity', () => {
  it('resolves every provider defaultModel to a real catalog entry', () => {
    for (const [id, provider] of Object.entries(modelsCatalog.providers)) {
      const defaultModel = (provider as { defaultModel?: string }).defaultModel;
      if (!defaultModel) continue;
      const meta = getModelMetadataById(defaultModel);
      expect(meta, `provider ${id} defaultModel "${defaultModel}" must resolve`).not.toBeNull();
    }
  });

  it('maps every model.provider back to a declared provider', () => {
    for (const [modelId, meta] of Object.entries(modelsCatalog.models)) {
      const provider = (meta as { provider?: string }).provider;
      expect(provider, `model ${modelId} missing provider`).toBeTruthy();
      expect(
        modelsCatalog.providers,
        `model ${modelId} provider "${provider}" not declared`,
      ).toHaveProperty(provider as string);
    }
  });

  it('does not throw resolving a default for any provider that declares one', () => {
    for (const [id, provider] of Object.entries(modelsCatalog.providers)) {
      if (!(provider as { defaultModel?: string }).defaultModel) continue;
      expect(
        () => requireProviderDefaultModel(id),
        `requireProviderDefaultModel(${id})`,
      ).not.toThrow();
    }
  });
});
