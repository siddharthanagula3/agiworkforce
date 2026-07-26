/**
 * Chrome extension provider stream client.
 *
 * Thin wrapper around the shared `@agiworkforce/provider-runtime` SSE client
 * (`packages/ai/provider-runtime/src/client/streamFromProvider.ts`). Keeps this
 * surface's public API (types + `streamFromProvider` signature) stable for
 * its callers, and turns on structured paywall (429) detection, which this
 * surface has always had.
 *
 * MV3 service workers have global fetch + ReadableStream. Same SSE frame
 * parser as the other surfaces.
 *
 * CORS note: the api-gateway's CORS config must allow the extension's
 * origin (`chrome-extension://<id>`) for the fetch to succeed. If you're
 * routing through a content script + Vercel-hosted Next.js proxy instead,
 * set `gatewayUrl` to `https://www.agiworkforce.com` and let the existing
 * `/api/v1/providers/*` Next.js proxy forward to the api-gateway.
 */

import { streamFromProvider as sharedStreamFromProvider } from '@agiworkforce/provider-runtime';

export type ProviderStreamProvider = 'anthropic' | 'openai' | 'ollama' | 'google';

export interface ProviderStreamMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ProviderStreamRequest {
  model: string;
  messages: ProviderStreamMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
}

/**
 * Paywall feature identifiers — mirrors InlinePaywallCard.tsx PaywallFeature type.
 * Kept in sync manually; if the web surface adds new features, add them here too.
 */
export const PAYWALL_FEATURES = [
  'video_generation',
  'opus_5',
  'gpt_5_5',
  'computer_use',
  'deep_research',
  'image_quota',
  'token_cap',
  'mcp',
  'web_search',
] as const;

export type PaywallFeature = (typeof PAYWALL_FEATURES)[number];

/**
 * Tier labels a paywall can require — mirrors InlinePaywallCard.tsx RequiredTier.
 */
export type PaywallRequiredTier = 'hobby' | 'pro' | 'pro_plus' | 'max';

/**
 * Structured paywall payload returned by the API at HTTP 429 when the user has
 * consumed 150% of their tier cap.  Shape: { kind:'paywall', feature, requiredTier, reason }.
 */
export interface PaywallPayload {
  kind: 'paywall';
  feature: PaywallFeature;
  requiredTier: PaywallRequiredTier;
  reason?: string;
}

export type StreamChunk =
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking-delta'; delta: string; signature?: string }
  | { type: 'tool-use-start'; toolUseId: string; name: string }
  | { type: 'tool-use-delta'; toolUseId: string; deltaJson: string }
  | { type: 'tool-use-end'; toolUseId: string }
  | {
      type: 'usage';
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      reasoningTokens?: number;
    }
  | { type: 'error'; code?: string; message: string; retryable?: boolean }
  | {
      type: 'stop';
      reason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'error' | 'cancel';
    }
  | {
      type: 'paywall';
      feature: PaywallFeature;
      requiredTier: PaywallRequiredTier;
      reason?: string;
    };

export interface StreamFromProviderParams {
  /**
   * Base URL of the api-gateway (or the Vercel proxy that forwards to it).
   * E.g. `https://www.agiworkforce.com` or `http://localhost:3001`.
   */
  gatewayUrl: string;
  providerId: ProviderStreamProvider;
  authToken: string;
  request: ProviderStreamRequest;
  signal?: AbortSignal;
}

export async function* streamFromProvider(
  params: StreamFromProviderParams,
): AsyncIterable<StreamChunk> {
  yield* sharedStreamFromProvider<ProviderStreamRequest, StreamChunk>({
    providerId: params.providerId,
    authToken: params.authToken,
    request: params.request,
    ...(params.signal ? { signal: params.signal } : {}),
    baseUrl: params.gatewayUrl,
    clientTag: 'agiworkforce-chrome-extension',
    detectPaywall: true,
  });
}
