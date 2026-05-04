/**
 * Provider stream client — browser-side SSE consumer for the
 * `/api/v1/providers/:providerId/stream` proxy route.
 *
 * Yields canonical `StreamChunk` objects (defined in `@agiworkforce/types`)
 * one at a time as they arrive over SSE. Stops cleanly on `[DONE]` or when
 * the caller signals abort.
 *
 * Usage:
 *   const ctrl = new AbortController();
 *   for await (const chunk of streamFromProvider({
 *     providerId: 'anthropic',
 *     authToken,
 *     request: { model, messages, ... },
 *     signal: ctrl.signal,
 *   })) {
 *     if (chunk.type === 'text-delta') append(chunk.delta);
 *   }
 */

import type { ChatRequest, StreamChunk } from '@agiworkforce/types';

export interface StreamFromProviderParams {
  providerId: 'anthropic' | 'openai' | 'ollama' | 'google';
  /** Bearer JWT for the api-gateway. Pulled from Supabase session in the page. */
  authToken: string;
  /** ChatRequest in canonical shape (provider-shape messages, tools, thinking). */
  request: ChatRequest;
  signal?: AbortSignal;
}

export async function* streamFromProvider(
  params: StreamFromProviderParams,
): AsyncIterable<StreamChunk> {
  const url = `/api/v1/providers/${encodeURIComponent(params.providerId)}/stream`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${params.authToken}`,
      'x-requested-with': 'agiworkforce-web',
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

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines. Each frame may have one or
      // more `data: ...` lines.
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
          // Skip malformed frames; the caller will see a missing usage/stop
          // chunk if anything material was lost.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
