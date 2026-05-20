import { afterEach, describe, expect, it } from 'vitest';
import { PROVIDER_STREAM_PROVIDER_PRESET_IDS } from '@agiworkforce/types';
import {
  buildProviderAdapter,
  isSupportedProviderId,
  listProviderAvailability,
  SUPPORTED_PROVIDER_IDS,
} from '../../src/lib/providerAdapters';

const ENV_KEYS = [
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'TOGETHER_API_KEY',
  'FIREWORKS_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe('provider adapter registry', () => {
  it('uses the shared provider-stream preset list as its allowlist', () => {
    expect(SUPPORTED_PROVIDER_IDS).toEqual(PROVIDER_STREAM_PROVIDER_PRESET_IDS);
    expect(isSupportedProviderId('open_router')).toBe(true);
    expect(isSupportedProviderId('groq')).toBe(true);
    expect(isSupportedProviderId('mistral')).toBe(true);
    expect(isSupportedProviderId('azure')).toBe(false);
    expect(isSupportedProviderId('bedrock')).toBe(false);
    expect(isSupportedProviderId('cohere')).toBe(false);
  });

  it('reports preset-provider availability from the provider-specific env var', () => {
    const unavailable = listProviderAvailability().find((provider) => provider.id === 'groq');
    expect(unavailable).toMatchObject({
      id: 'groq',
      available: false,
      unavailableReason: 'GROQ_API_KEY not set',
    });

    process.env.GROQ_API_KEY = 'test-groq-key';
    const available = listProviderAvailability().find((provider) => provider.id === 'groq');
    expect(available).toMatchObject({ id: 'groq', available: true });
  });

  it('builds OpenAI-compatible preset adapters with canonical provider identity', async () => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    const adapter = buildProviderAdapter('open_router');

    expect(adapter?.id).toBe('open_router');
    expect(adapter?.label).toBe('OpenRouter');
    expect(adapter?.config.baseUrl).toBe('https://openrouter.ai/api/v1');
    await expect(adapter?.catalog()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'meta-llama/llama-3.3-70b-instruct:free',
          provider: 'open_router',
        }),
      ]),
    );
  });

  it('returns curated catalog models for Mistral without network discovery', async () => {
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
    const adapter = buildProviderAdapter('mistral');

    expect(adapter?.id).toBe('mistral');
    await expect(adapter?.catalog()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'mistral-large-3',
          provider: 'mistral',
        }),
        expect.objectContaining({
          id: 'codestral-2',
          provider: 'mistral',
        }),
      ]),
    );
  });
});
