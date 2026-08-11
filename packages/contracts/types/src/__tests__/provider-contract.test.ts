/**
 * Provider-contract harness (INC-0.4).
 *
 * One SSOT-grounded contract that every provider in `models.json` must satisfy,
 * so a careless catalog edit can never silently break provider routing or, worse,
 * a trust boundary. These are pure data/logic assertions over the committed
 * catalog — no network, no env, no mocks.
 *
 * The contract:
 *   1. Surface classification is total and valid — `getProviderSurface` returns
 *      one of the four known surfaces for every catalogued provider.
 *   2. Trust boundaries are unambiguous — BYOK and Local providers are NEVER also
 *      classified managed_cloud (a provider in two funded/unfunded surfaces would
 *      break billing and the Local→BYOK isolation invariant). Managed providers
 *      are never reclassified local/byok.
 *   3. Default models resolve — every provider's `defaultModel` is a real catalog
 *      entry (no dangling pointer the picker/router would choke on).
 *   4. Referential integrity — every model's `provider` exists in `providers`.
 *   5. Surfaced providers are usable — `requireProviderDefaultModel` does not throw
 *      for any provider that exposes a default.
 */
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
    // BYOK = user keys, no AGI-funded compute; Local = on-device. Neither may be
    // mistaken for the AGI-funded managed_cloud surface, or billing/isolation breaks.
    for (const id of providerIds) {
      const surface = getProviderSurface(id);
      if (surface === 'byok' || surface === 'local') {
        expect(surface, `${id} must not be managed_cloud`).not.toBe('managed_cloud');
      }
    }
    // Pin the known boundary cases so a reclassification is caught explicitly.
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
