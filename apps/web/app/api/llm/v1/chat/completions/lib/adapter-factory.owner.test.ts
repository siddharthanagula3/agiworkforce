import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderAdapter } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

vi.mock('server-only', () => ({}));

const serviceAdapter = {
  id: 'openai',
  label: 'Service-owned adapter',
  auth: [],
  config: {},
  async catalog() {
    return [];
  },
  async *stream() {
    yield { type: 'stop' as const, reason: 'end_turn' };
  },
} satisfies ProviderAdapter;

type AdapterBuildOptions = {
  anthropicCache?: {
    enableCacheControl?: boolean;
    cacheRetention?: 'short' | 'long' | 'none';
  };
};

const buildServerProviderAdapter = vi.fn(
  (_providerId: string, _options?: AdapterBuildOptions) => serviceAdapter,
);

vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: (providerId: string, options?: AdapterBuildOptions) =>
    options === undefined
      ? buildServerProviderAdapter(providerId)
      : buildServerProviderAdapter(providerId, options),
  listAvailableManagedProviderIds: () => new Set<string>(),
  resolveProviderFromModel: (model: string) => model,
  toGenericUpstreamError: vi.fn(),
}));

import {
  buildAnthropicAdapter,
  buildDeepSeekAdapter,
  buildGoogleAdapter,
  buildGroqAdapter,
  buildMinimaxAdapter,
  buildMoonshotAdapter,
  buildNvidiaNimAdapter,
  buildOpenAIAdapter,
  buildOpenRouterAdapter,
  buildPerplexityAdapter,
  buildQwenAdapter,
  buildVercelGatewayAdapter,
  buildWorkersAiAdapter,
  buildXAIAdapter,
  buildZhipuAdapter,
} from './adapter-factory';

const SERVER_PROVIDER_BUILDERS: ReadonlyArray<{
  providerId: string;
  build: () => ProviderAdapter;
}> = [
  { providerId: 'google', build: buildGoogleAdapter },
  { providerId: 'openai', build: buildOpenAIAdapter },
  { providerId: 'minimax', build: buildMinimaxAdapter },
  { providerId: 'moonshot', build: buildMoonshotAdapter },
  { providerId: 'zhipu', build: buildZhipuAdapter },
  { providerId: 'qwen', build: buildQwenAdapter },
  { providerId: 'openrouter', build: buildOpenRouterAdapter },
  { providerId: 'deepseek', build: buildDeepSeekAdapter },
  { providerId: 'xai', build: buildXAIAdapter },
  { providerId: 'perplexity', build: buildPerplexityAdapter },
  { providerId: 'groq', build: buildGroqAdapter },
  { providerId: 'nvidia_nim', build: buildNvidiaNimAdapter },
  { providerId: 'workers_ai', build: buildWorkersAiAdapter },
  { providerId: 'vercel_gateway', build: buildVercelGatewayAdapter },
];

describe('managed Web adapter construction ownership', () => {
  beforeEach(() => {
    buildServerProviderAdapter.mockClear();
  });

  it.each(SERVER_PROVIDER_BUILDERS)(
    'delegates $providerId construction to the shared Web provider service',
    ({ providerId, build }) => {
      expect(build()).toBe(serviceAdapter);
      expect(buildServerProviderAdapter).toHaveBeenCalledOnce();
      expect(buildServerProviderAdapter).toHaveBeenCalledWith(providerId);
    },
  );

  it('preserves request-specific Anthropic prompt-cache configuration at the service boundary', () => {
    const processed = {
      llmRequest: {
        usePromptCache: true,
        tools: [],
      },
    } as unknown as ProcessedRequest;

    expect(buildAnthropicAdapter(processed)).toBe(serviceAdapter);
    expect(buildServerProviderAdapter).toHaveBeenCalledOnce();
    expect(buildServerProviderAdapter).toHaveBeenCalledWith('anthropic', {
      anthropicCache: {
        enableCacheControl: true,
        cacheRetention: 'long',
      },
    });
  });
});
