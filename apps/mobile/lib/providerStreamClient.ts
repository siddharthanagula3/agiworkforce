/**
 * Expo / React Native provider stream client.
 *
 * RN's fetch supports streaming responses via `react-native-fetch-api` /
 * the bundled `whatwg-fetch` polyfill on newer Expo SDKs. We use the
 * `body.getReader()` interface which is available on all current Expo
 * runtimes.
 *
 * Tested with Expo SDK 50+. Older RN runtimes that don't expose
 * `Response.body` should fall back to a polyfill (`react-native-sse`).
 */

import type { Effort } from '@agiworkforce/types';
// Zero-leak chokepoint: this client streams through OUR api-gateway
// (`${gatewayUrl}/api/v1/providers/...`, gatewayUrl = API_URL). Route it through
// guardedFetch so Local mode refuses the request before any network I/O
// (fail-closed). guardedFetch delegates to secureFetch (TLS pinning) when allowed.
import { guardedFetch } from '@/lib/egressGuard';
import { combineAbortSignals } from '@/lib/abortSignal';

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

const STREAM_IDLE_TIMEOUT_MS = 45_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Provider stream failed.';
}

function createIdleWatchdog(parentSignal?: AbortSignal): {
  signal: AbortSignal;
  reset: () => void;
  dispose: () => void;
} {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const reset = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      controller.abort(new Error('Provider stream timed out while waiting for data.'));
    }, STREAM_IDLE_TIMEOUT_MS);
  };

  reset();

  return {
    signal: parentSignal
      ? combineAbortSignals([parentSignal, controller.signal])
      : controller.signal,
    reset,
    dispose: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}

export async function* streamFromProvider(
  params: StreamFromProviderParams,
): AsyncIterable<StreamChunk> {
  const url = `${params.gatewayUrl.replace(/\/+$/, '')}/api/v1/providers/${encodeURIComponent(
    params.providerId,
  )}/stream`;
  const watchdog = createIdleWatchdog(params.signal);
  let res: Response;

  try {
    res = await guardedFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.authToken}`,
        'x-requested-with': 'agiworkforce-mobile',
      },
      body: JSON.stringify(params.request),
      signal: watchdog.signal,
    });
  } catch (error) {
    watchdog.dispose();
    yield {
      type: 'error',
      code: watchdog.signal.aborted ? 'STREAM_TIMEOUT_OR_ABORT' : 'STREAM_FETCH_ERROR',
      message: errorMessage(error),
      retryable: !params.signal?.aborted,
    };
    yield { type: 'stop', reason: params.signal?.aborted ? 'cancel' : 'error' };
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    watchdog.dispose();
    yield {
      type: 'error',
      message: text || `Upstream error ${res.status}`,
      ...(res.status >= 500 ? { retryable: true } : {}),
    };
    yield { type: 'stop', reason: 'error' };
    return;
  }

  const reader = (res.body as unknown as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      watchdog.reset();
      buffer += decoder.decode(value, { stream: true });
      let frameEnd: number;
      while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        const dataLines = frame
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart());
        const data = dataLines.join('\n').trim();
        if (!data) continue;
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data) as StreamChunk;
        } catch (error) {
          yield {
            type: 'error',
            code: 'MALFORMED_SSE_FRAME',
            message: `Malformed provider stream frame: ${errorMessage(error)}`,
            retryable: false,
          };
        }
      }
    }
  } catch (error) {
    yield {
      type: 'error',
      code: watchdog.signal.aborted ? 'STREAM_TIMEOUT_OR_ABORT' : 'STREAM_READ_ERROR',
      message: errorMessage(error),
      retryable: !params.signal?.aborted,
    };
    yield { type: 'stop', reason: params.signal?.aborted ? 'cancel' : 'error' };
  } finally {
    reader.releaseLock();
    watchdog.dispose();
  }
}
