import { describe, expect, it } from 'vitest';

import type { ProviderAdapter, ProviderAdapterConfig } from '@agiworkforce/types';
import { createProviderAdapter, PROVIDER_ADAPTER_IDS } from './index';

const FACTORY_CASES = [
  ['anthropic', 'anthropic'],
  ['deepseek', 'deepseek'],
  ['google', 'google'],
  ['groq', 'groq'],
  ['lmstudio', 'lmstudio'],
  ['mistral', 'mistral'],
  ['moonshot', 'moonshot'],
  ['ollama', 'ollama'],
  ['openai', 'openai'],
  ['open_router', 'open_router'],
  ['perplexity', 'perplexity'],
  ['qwen', 'qwen'],
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
      const adapter = createProviderAdapter(providerId, { apiKey: 'test-key' });

      expect(adapter.id).toBe(expectedAdapterId);
      expect(adapter.config.apiKey).toBe('test-key');
    },
  );

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
