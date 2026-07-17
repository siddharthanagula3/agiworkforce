/**
 * Expo / React Native provider stream client.
 *
 * Thin wrapper around the shared `@agiworkforce/provider-runtime` SSE client
 * (`packages/ai/provider-runtime/src/client/streamFromProvider.ts`). Keeps this
 * surface's public API (types + `streamFromProvider` signature) stable for
 * its callers, and turns on the two behaviors this surface has always had:
 * the idle watchdog (cellular/NAT drops are a common transient failure on
 * mobile) and resilient error-chunk conversion (transport failures become
 * typed `error`/`stop` chunks instead of thrown exceptions).
 *
 * RN's fetch supports streaming responses via `react-native-fetch-api` /
 * the bundled `whatwg-fetch` polyfill on newer Expo SDKs. We use the
 * `body.getReader()` interface which is available on all current Expo
 * runtimes.
 *
 * Tested with Expo SDK 50+. Older RN runtimes that don't expose
 * `Response.body` should fall back to a polyfill (`react-native-sse`).
 */

import { streamFromProvider as sharedStreamFromProvider } from '@agiworkforce/provider-runtime';
// Zero-leak chokepoint: this client streams through OUR api-gateway
// (`${gatewayUrl}/api/v1/providers/...`, gatewayUrl = API_URL). Route it through
// guardedFetch so Local mode refuses the request before any network I/O
// (fail-closed). guardedFetch delegates to secureFetch (TLS pinning) when allowed.
import { guardedFetch } from '@/lib/egressGuard';

export type ProviderStreamProvider =
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'moonshot';

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
    };

export interface StreamFromProviderParams {
  /** Base URL of the api-gateway, e.g. https://api.agiworkforce.com */
  gatewayUrl: string;
  providerId: ProviderStreamProvider;
  authToken: string;
  request: ProviderStreamRequest;
  signal?: AbortSignal;
}

/** Per-chunk idle timeout. Cellular hand-off / NAT drops leave a stalled connection with no
 * signal other than silence, so we fail fast instead of hanging until the OS-level TCP timeout. */
const STREAM_IDLE_TIMEOUT_MS = 45_000;

export async function* streamFromProvider(
  params: StreamFromProviderParams,
): AsyncIterable<StreamChunk> {
  yield* sharedStreamFromProvider<ProviderStreamRequest, StreamChunk>({
    providerId: params.providerId,
    authToken: params.authToken,
    request: params.request,
    ...(params.signal ? { signal: params.signal } : {}),
    baseUrl: params.gatewayUrl,
    // Stream via expo/fetch so `res.body` is a real ReadableStream (token-by-token);
    // guardedFetch threads `{ stream: true }` down to secureFetch.
    fetchImpl: (input, init) => guardedFetch(input, init, { stream: true }),
    clientTag: 'agiworkforce-mobile',
    idleWatchdog: { idleMs: STREAM_IDLE_TIMEOUT_MS },
    catchTransportErrors: true,
    surfaceMalformedFrames: true,
  });
}
