/**
 * Chrome extension provider stream client.
 *
 * MV3 service workers have global fetch + ReadableStream. Same SSE frame
 * parser as `apps/web/lib/providerStreamClient.ts`.
 *
 * CORS note: the api-gateway's CORS config must allow the extension's
 * origin (`chrome-extension://<id>`) for the fetch to succeed. If you're
 * routing through a content script + Vercel-hosted Next.js proxy instead,
 * set `gatewayUrl` to `https://www.agiworkforce.com` and let the existing
 * `/api/v1/providers/*` Next.js proxy forward to the api-gateway.
 */

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
  const url = `${params.gatewayUrl.replace(/\/+$/, '')}/api/v1/providers/${encodeURIComponent(
    params.providerId,
  )}/stream`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${params.authToken}`,
      'x-requested-with': 'agiworkforce-chrome-extension',
    },
    body: JSON.stringify(params.request),
    ...(params.signal ? { signal: params.signal } : {}),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    yield {
      type: 'error',
      message: text || `Upstream error ${res.status}`,
      ...(res.status >= 500 ? { retryable: true } : {}),
    };
    yield { type: 'stop', reason: 'error' };
    return;
  }

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
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
        } catch {
          // ignore malformed
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
