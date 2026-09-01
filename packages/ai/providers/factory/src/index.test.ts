import { describe, expect, it } from 'vitest';

import type { ProviderAdapter, ProviderAdapterConfig } from '@agiworkforce/types';
import { createProviderAdapter, PROVIDER_ADAPTER_IDS, type ProviderAdapterId } from './index';

const WORKERS_AI_TEST_BASE_URL =
  'https://gateway.ai.cloudflare.com/v1/3c4f35af67459cbabbccb783f232fad9/agiworkforce/compat';

/**
 * Gateways whose endpoint embeds account-scoped path segments have no
 * serviceable default, so the factory cannot construct them from a key alone.
 */
const REQUIRED_BASE_URLS: Partial<Record<ProviderAdapterId, string>> = {
  workers_ai: WORKERS_AI_TEST_BASE_URL,
};

const FACTORY_CASES = [
  ['anthropic', 'anthropic'],
  ['deepseek', 'deepseek'],
  ['google', 'google'],
  ['groq', 'groq'],
  ['lmstudio', 'lmstudio'],
  ['minimax', 'minimax'],
  ['moonshot', 'moonshot'],
  ['nvidia_nim', 'nvidia_nim'],
  ['ollama', 'ollama'],
  ['openai', 'openai'],
  ['open_router', 'open_router'],
  ['perplexity', 'perplexity'],
  ['qwen', 'qwen'],
  ['vercel_gateway', 'vercel_gateway'],
  ['workers_ai', 'workers_ai'],
  ['xai', 'xai'],
  ['zhipu', 'zhipu'],
] as const;

describe('provider adapter factory', () => {
  it('exports the complete canonical leaf-adapter roster', () => {
    expect(PROVIDER_ADAPTER_IDS).toEqual(FACTORY_CASES.map(([providerId]) => providerId));
  });

  it.each(FACTORY_CASES)(
    'constructs the %s leaf adapter without owning deployment policy',
    (providerId, expectedAdapterId) => {
      const requiredBaseUrl = REQUIRED_BASE_URLS[providerId];
      const adapter = createProviderAdapter(providerId, {
        apiKey: 'test-key',
        ...(requiredBaseUrl ? { baseUrl: requiredBaseUrl } : {}),
      });

      expect(adapter.id).toBe(expectedAdapterId);
      expect(adapter.config.apiKey).toBe('test-key');
    },
  );

  it('refuses to construct an account-scoped gateway adapter with no baseUrl', () => {
    expect(() => createProviderAdapter('workers_ai', { apiKey: 'test-key' })).toThrow(
      /requires an explicit baseUrl/,
    );
  });

  it('rejects a provider ID that has no registered leaf adapter', () => {
    const untypedFactory = createProviderAdapter as unknown as (
      providerId: string,
      config: ProviderAdapterConfig,
    ) => ProviderAdapter;

    expect(() => untypedFactory('managed_cloud', {})).toThrow(
      'Unsupported provider adapter: managed_cloud',
    );
  });
});
