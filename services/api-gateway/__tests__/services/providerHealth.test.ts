import { afterEach, describe, expect, it, vi } from 'vitest';

const REMOVED_PROVIDER_IDS = [
  'ai21',
  'azure',
  'cerebras',
  'cohere',
  'deepinfra',
  'fireworks',
  'groq',
  'mistral',
  'sambanova',
  'together',
] as const;

describe('provider health policy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not monitor or recommend founder-removed providers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));

    const { checkAllProviders, getFallbackRecommendation } =
      await import('../../src/services/providerHealth');
    const providers = await checkAllProviders();
    const providerIds = providers.map((provider) => provider.provider);

    expect(providerIds).toContain('minimax');

    for (const removedProvider of REMOVED_PROVIDER_IDS) {
      expect(providerIds).not.toContain(removedProvider);
      await expect(getFallbackRecommendation(removedProvider)).resolves.toBeNull();
    }
  });
});
