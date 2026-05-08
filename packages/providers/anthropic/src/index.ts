/**
 * @agiworkforce/providers-anthropic
 *
 * Anthropic Claude provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Wraps the official `@anthropic-ai/sdk` for the wire
 * (streaming SSE, retries, error handling), and uses
 * `@agiworkforce/llm-normalize` for cross-vendor payload policy.
 *
 * Design choices:
 *   - Vendor SDK handles HTTP/SSE so we don't reinvent transport.
 *   - We translate `ChatRequest` → SDK params, then mutate the SDK params via
 *     `applyAnthropicPayloadPolicyToParams` for cache_control + service_tier.
 *   - Stream events from the SDK are translated to AGI Workforce's canonical
 *     `StreamChunk` discriminated union.
 *
 * @packageDocumentation
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AuthMethod,
  ChatRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderAdapterFactory,
  ProviderCatalogContext,
  ReplayPolicyContext,
  StreamChunk,
} from '@agiworkforce/types';
import {
  applyAnthropicPayloadPolicyToParams,
  resolveAnthropicPayloadPolicy,
} from '@agiworkforce/llm-normalize';

import { ANTHROPIC_MODEL_CATALOG } from './catalog';
import { translateChatRequest } from './translate';
import { translateAnthropicStream } from './stream';
import { buildAnthropicReplayPolicy } from './replay-policy';

const ANTHROPIC_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'ANTHROPIC_API_KEY',
    required: true,
    label: 'Anthropic API Key',
  },
  {
    kind: 'oauth',
    authUrl: 'https://console.anthropic.com/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/oauth/token',
    clientId: 'agiworkforce',
    label: 'Anthropic Console OAuth',
  },
];

export interface AnthropicAdapterConfig extends ProviderAdapterConfig {
  /** Enable ephemeral cache_control on system prompt + last user turn. */
  enableCacheControl?: boolean;
  /** Cache retention strategy. Default: short. */
  cacheRetention?: 'short' | 'long' | 'none';
  /** Anthropic service tier (api.anthropic.com only). */
  serviceTier?: 'auto' | 'standard_only';
  /** Beta features (e.g., "prompt-caching-2024-07-31"). */
  betaFeatures?: string[];
}

export function createAnthropicAdapter(config: AnthropicAdapterConfig = {}): ProviderAdapter {
  const sdk = new Anthropic({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    ...(config.fetch ? { fetch: config.fetch } : {}),
    ...(config.betaFeatures && config.betaFeatures.length > 0
      ? {
          defaultHeaders: {
            'anthropic-beta': config.betaFeatures.join(','),
          },
        }
      : {}),
  });

  return {
    id: 'anthropic',
    label: 'Anthropic',
    auth: ANTHROPIC_AUTH_METHODS,
    config,

    async catalog(_ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      return [...ANTHROPIC_MODEL_CATALOG];
    },

    buildReplayPolicy(_ctx: ReplayPolicyContext) {
      return buildAnthropicReplayPolicy();
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const translated = translateChatRequest(req);

      // Apply Anthropic-specific payload policy (cache_control + service_tier).
      const policy = resolveAnthropicPayloadPolicy({
        api: 'anthropic-messages',
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        ...(config.cacheRetention ? { cacheRetention: config.cacheRetention } : {}),
        ...(config.enableCacheControl !== undefined
          ? { enableCacheControl: config.enableCacheControl }
          : {}),
        provider: 'anthropic',
        ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
      });

      // Mutate translated params in-place per policy.
      const payload = translated as unknown as Record<string, unknown>;
      applyAnthropicPayloadPolicyToParams(payload, policy);

      // Hand off to SDK. The SDK's `messages.stream()` returns an async iterable
      // of MessageStreamEvent which we translate to our StreamChunk shape.
      try {
        const sdkStream = sdk.messages.stream(
          translated as unknown as Anthropic.MessageStreamParams,
          { signal },
        );
        for await (const chunk of translateAnthropicStream(sdkStream)) {
          yield chunk;
        }
      } catch (err) {
        const error = err as Error & { status?: number };
        const retryable =
          typeof error.status === 'number' && (error.status === 429 || error.status >= 500);
        yield {
          type: 'error',
          message: error.message ?? 'Anthropic request failed',
          ...(typeof error.status === 'number' ? { code: String(error.status) } : {}),
          retryable,
        };
        yield { type: 'stop', reason: 'error' };
      }
    },
  };
}

export const anthropicAdapterFactory: ProviderAdapterFactory = (config) =>
  createAnthropicAdapter(config as AnthropicAdapterConfig);

export { ANTHROPIC_MODEL_CATALOG } from './catalog';
export { translateChatRequest } from './translate';
export { translateAnthropicStream } from './stream';
export { buildAnthropicReplayPolicy } from './replay-policy';
