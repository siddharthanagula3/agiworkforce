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
    vi.unstubAllEnvs();
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

  it('accepts a PROVIDER_HEALTH_URLS host the canonical provider list carries', async () => {
    const pingUrl = 'https://openrouter.ai/api/v1/models';
    const fetchMock = vi.fn().mockResolvedValue({ status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv(
      'PROVIDER_HEALTH_URLS',
      JSON.stringify([{ id: 'deepseek', label: 'DeepSeek', pingUrl, family: 'deepseek' }]),
    );

    const { checkAllProviders } = await import('../../src/services/providerHealth');
    const providers = await checkAllProviders();

    expect(providers.map((provider) => provider.provider)).toEqual(['deepseek']);
    expect(fetchMock).toHaveBeenCalledWith(pingUrl, expect.anything());
  });

  it('rejects a PROVIDER_HEALTH_URLS override aimed at loopback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv(
      'PROVIDER_HEALTH_URLS',
      JSON.stringify([
        { id: 'openai', label: 'OpenAI', pingUrl: 'https://localhost/v1/models', family: 'gpt' },
      ]),
    );

    const { checkAllProviders } = await import('../../src/services/providerHealth');
    const providers = await checkAllProviders();

    expect(providers.length).toBeGreaterThan(1);
    expect(fetchMock).not.toHaveBeenCalledWith('https://localhost/v1/models', expect.anything());
  });
});
