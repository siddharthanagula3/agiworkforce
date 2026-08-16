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
} from './adapter-factory';
import {
  buildAnthropicChatRequest,
  buildGoogleChatRequest,
  buildOpenAIChatRequest,
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
} from './adapter-errors';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

export const ADAPTER_PROVIDERS: Record<
  string,
  {
    buildAdapter: (processed: ProcessedRequest) => ProviderAdapter;
    buildChatRequest: (processed: ProcessedRequest) => ChatRequest;
    mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error;
    wireMode: 'legacy-web' | 'openai-passthrough';
  }
> = {
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
};
