import 'server-only';

import {
  buildAnthropicAdapter,
  buildGoogleAdapter,
  buildOpenAIAdapter,
  buildMinimaxAdapter,
  buildMoonshotAdapter,
  buildZhipuAdapter,
  buildQwenAdapter,
  buildOpenRouterAdapter,
  buildDeepSeekAdapter,
  buildXAIAdapter,
  buildPerplexityAdapter,
  buildGroqAdapter,
  buildNvidiaNimAdapter,
  buildWorkersAiAdapter,
  buildVercelGatewayAdapter,
} from './adapter-factory';
import {
  buildAnthropicChatRequest,
  buildGoogleChatRequest,
  buildOpenAIChatRequest,
  computeAnthropicCacheConfig,
  toCanonicalChatRequest,
} from './canonical-request';
import {
  toUpstreamError,
  toGoogleUpstreamError,
  toOpenAIUpstreamError,
  toMinimaxUpstreamError,
  toMoonshotUpstreamError,
  toZhipuUpstreamError,
  toQwenUpstreamError,
  toOpenRouterUpstreamError,
  toDeepSeekUpstreamError,
  toXAIUpstreamError,
  toPerplexityUpstreamError,
  toGroqUpstreamError,
  toNvidiaNimUpstreamError,
  toWorkersAiUpstreamError,
  toVercelGatewayUpstreamError,
  makeUpstreamErrorMapper,
} from './adapter-errors';
import { buildProtocolRouteAdapter } from '@/lib/services/provider-adapter-service';
import { listProtocolRoutes } from '@agiworkforce/types';
import type {
  ChatRequest,
  HarnessProtocol,
  ProviderAdapter,
  StreamChunk,
} from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

interface AdapterProviderEntry {
  buildAdapter: (processed: ProcessedRequest) => ProviderAdapter;
  buildChatRequest: (processed: ProcessedRequest) => ChatRequest;
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error;
  wireMode: 'legacy-web' | 'openai-passthrough';
}

/**
 * What each wire protocol needs from this layer.
 *
 * The dialect decides how the canonical request is shaped and whether the
 * Anthropic prompt-cache configuration travels with it; nothing else about a
 * protocol route is provider-specific.
 */
const PROTOCOL_WIRE: Readonly<
  Record<
    Exclude<HarnessProtocol, 'provider_native'>,
    Pick<AdapterProviderEntry, 'buildChatRequest' | 'wireMode'> & { anthropicCache: boolean }
  >
> = {
  openai_chat: {
    buildChatRequest: toCanonicalChatRequest,
    wireMode: 'openai-passthrough',
    anthropicCache: false,
  },
  openai_responses: {
    buildChatRequest: buildOpenAIChatRequest,
    wireMode: 'openai-passthrough',
    anthropicCache: false,
  },
  anthropic_messages: {
    buildChatRequest: buildAnthropicChatRequest,
    wireMode: 'legacy-web',
    anthropicCache: true,
  },
  gemini_native: {
    buildChatRequest: buildGoogleChatRequest,
    wireMode: 'legacy-web',
    anthropicCache: false,
  },
};

/**
 * Dispatch entries for every route the registry describes by protocol.
 *
 * A gateway that speaks a dialect we already implement needs no adapter
 * package: the endpoint, the credential and the wire format all come from its
 * harness, and attribution stays keyed by the route's provider id.
 */
function protocolRouteProviders(): Record<string, AdapterProviderEntry> {
  const entries: Record<string, AdapterProviderEntry> = {};
  for (const route of listProtocolRoutes()) {
    if (entries[route.provider]) continue;
    const wire = PROTOCOL_WIRE[route.protocol];
    const { provider } = route;
    entries[provider] = {
      buildAdapter: (processed) =>
        buildProtocolRouteAdapter(
          provider,
          wire.anthropicCache ? { anthropicCache: computeAnthropicCacheConfig(processed) } : {},
        ),
      buildChatRequest: wire.buildChatRequest,
      mapError: makeUpstreamErrorMapper(provider),
      wireMode: wire.wireMode,
    };
  }
  return entries;
}

const BESPOKE_ADAPTER_PROVIDERS: Record<string, AdapterProviderEntry> = {
  anthropic: {
    buildAdapter: buildAnthropicAdapter,
    buildChatRequest: buildAnthropicChatRequest,
    mapError: toUpstreamError,
    wireMode: 'legacy-web',
  },
  google: {
    buildAdapter: buildGoogleAdapter,
    buildChatRequest: buildGoogleChatRequest,
    mapError: toGoogleUpstreamError,
    wireMode: 'legacy-web',
  },
  openai: {
    buildAdapter: buildOpenAIAdapter,
    buildChatRequest: buildOpenAIChatRequest,
    mapError: toOpenAIUpstreamError,
    wireMode: 'openai-passthrough',
  },
  minimax: {
    buildAdapter: buildMinimaxAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toMinimaxUpstreamError,
    wireMode: 'openai-passthrough',
  },
  moonshot: {
    buildAdapter: buildMoonshotAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toMoonshotUpstreamError,
    wireMode: 'openai-passthrough',
  },
  zhipu: {
    buildAdapter: buildZhipuAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toZhipuUpstreamError,
    wireMode: 'openai-passthrough',
  },
  qwen: {
    buildAdapter: buildQwenAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toQwenUpstreamError,
    wireMode: 'openai-passthrough',
  },
  openrouter: {
    buildAdapter: buildOpenRouterAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toOpenRouterUpstreamError,
    wireMode: 'openai-passthrough',
  },
  deepseek: {
    buildAdapter: buildDeepSeekAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toDeepSeekUpstreamError,
    wireMode: 'openai-passthrough',
  },
  xai: {
    buildAdapter: buildXAIAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toXAIUpstreamError,
    wireMode: 'openai-passthrough',
  },
  perplexity: {
    buildAdapter: buildPerplexityAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toPerplexityUpstreamError,
    wireMode: 'openai-passthrough',
  },
  groq: {
    buildAdapter: buildGroqAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toGroqUpstreamError,
    wireMode: 'openai-passthrough',
  },
  nvidia_nim: {
    buildAdapter: buildNvidiaNimAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toNvidiaNimUpstreamError,
    wireMode: 'openai-passthrough',
  },
  workers_ai: {
    buildAdapter: buildWorkersAiAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toWorkersAiUpstreamError,
    wireMode: 'openai-passthrough',
  },
  vercel_gateway: {
    buildAdapter: buildVercelGatewayAdapter,
    buildChatRequest: toCanonicalChatRequest,
    mapError: toVercelGatewayUpstreamError,
    wireMode: 'openai-passthrough',
  },
};

export const ADAPTER_PROVIDERS: Record<string, AdapterProviderEntry> = {
  ...protocolRouteProviders(),
  ...BESPOKE_ADAPTER_PROVIDERS,
};
