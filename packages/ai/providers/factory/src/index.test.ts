import { describe, expect, it } from 'vitest';

import type { ProviderAdapter, ProviderAdapterConfig } from '@agiworkforce/types';
import { createProviderAdapter, PROVIDER_ADAPTER_IDS, type ProviderAdapterId } from './index';

const WORKERS_AI_TEST_BASE_URL =
  'https://gateway.ai.cloudflare.com/v1/3c4f35af67459cbabbccb783f232fad9/agiworkforce/compat';
const PROTOCOL_ROUTE_TEST_BASE_URL = 'https://api.reseller.test/v1';
const PROTOCOL_ROUTE_TEST_PROVIDER_ID = 'reseller_under_test';
const PROTOCOL_ROUTE_TEST_LABEL = 'Reseller Under Test';
const PROTOCOL_ROUTE_TEST_KEY_ENV = 'AGI_RESELLER_UNDER_TEST_API_KEY';

/**
 * Gateways whose endpoint embeds account-scoped path segments have no
 * serviceable default, so the factory cannot construct them from a key alone.
 */
const REQUIRED_BASE_URLS: Partial<Record<ProviderAdapterId, string>> = {
  workers_ai: WORKERS_AI_TEST_BASE_URL,
  openai_compat: PROTOCOL_ROUTE_TEST_BASE_URL,
};

const REQUIRED_IDENTITY: Partial<Record<ProviderAdapterId, Record<string, string>>> = {
  openai_compat: {
    providerId: PROTOCOL_ROUTE_TEST_PROVIDER_ID,
    label: PROTOCOL_ROUTE_TEST_LABEL,
    apiKeyEnvVar: PROTOCOL_ROUTE_TEST_KEY_ENV,
  },
};

const FACTORY_CASES = [
  ['openai_compat', PROTOCOL_ROUTE_TEST_PROVIDER_ID],
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
        ...(REQUIRED_IDENTITY[providerId] ?? {}),
      } as never);

      expect(adapter.id).toBe(expectedAdapterId);
      expect(adapter.config.apiKey).toBe('test-key');
    },
  );

  it('takes its identity and auth env var from the caller for a protocol route', () => {
    const adapter = createProviderAdapter('openai_compat', {
      apiKey: 'test-key',
      baseUrl: PROTOCOL_ROUTE_TEST_BASE_URL,
      providerId: PROTOCOL_ROUTE_TEST_PROVIDER_ID,
      label: PROTOCOL_ROUTE_TEST_LABEL,
      apiKeyEnvVar: PROTOCOL_ROUTE_TEST_KEY_ENV,
    });

    expect(adapter.label).toBe(PROTOCOL_ROUTE_TEST_LABEL);
    expect(adapter.auth).toEqual([
      {
        kind: 'api-key',
        envVar: PROTOCOL_ROUTE_TEST_KEY_ENV,
        required: true,
        label: PROTOCOL_ROUTE_TEST_LABEL,
      },
    ]);
    expect(adapter.config.baseUrl).toBe(PROTOCOL_ROUTE_TEST_BASE_URL);
  });

  it('refuses to construct a protocol-route adapter with no baseUrl', () => {
    expect(() =>
      createProviderAdapter('openai_compat', {
        apiKey: 'test-key',
        providerId: PROTOCOL_ROUTE_TEST_PROVIDER_ID,
        label: PROTOCOL_ROUTE_TEST_LABEL,
        apiKeyEnvVar: PROTOCOL_ROUTE_TEST_KEY_ENV,
      }),
    ).toThrow(/requires an explicit baseUrl/);
  });

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
