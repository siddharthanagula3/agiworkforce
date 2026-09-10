import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import { createGoogleAdapter } from '../index';
import { GOOGLE_DEFAULT_MODEL_ID } from './model-fixtures';

const HEADERS_TIMEOUT_MS = 50;
const PAST_THE_HEADER_TIMEOUT_MS = HEADERS_TIMEOUT_MS * 4;

const FIRST_LINE =
  'data: {"candidates":[{"content":{"parts":[{"text":"first"}],"role":"model"},"index":0}]}\n\n';
const LAST_LINE =
  'data: {"candidates":[{"content":{"parts":[{"text":" last"}],"role":"model"},' +
  '"finishReason":"STOP","index":0}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\n\n';

function slowTailBody(signal: AbortSignal, resumeAfterMs: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let sentFirst = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener(
        'abort',
        () => controller.error(signal.reason ?? new Error('aborted')),
        { once: true },
      );
    },
    pull(controller) {
      if (!sentFirst) {
        sentFirst = true;
        controller.enqueue(encoder.encode(FIRST_LINE));
        return;
      }
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          controller.enqueue(encoder.encode(LAST_LINE));
          controller.close();
          resolve();
        }, resumeAfterMs);
      });
    },
  });
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

describe('the Google header timeout bounds the wait for headers, not the answer', () => {
  it('delivers a body that streams past the header timeout', async () => {
    const adapter = createGoogleAdapter({
      apiKey: 'test-key',
      skipDiscovery: true,
      headersTimeoutMs: HEADERS_TIMEOUT_MS,
      fetch: (async (_url: string, init: RequestInit) =>
        new Response(slowTailBody(init.signal as AbortSignal, PAST_THE_HEADER_TIMEOUT_MS), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })) as unknown as typeof fetch,
    });

    const chunks = await collect(
      adapter.stream(
        { model: GOOGLE_DEFAULT_MODEL_ID, messages: [{ role: 'user', content: 'hi' }] } as never,
        new AbortController().signal,
      ),
    );

    const text = chunks
      .filter(
        (chunk): chunk is Extract<StreamChunk, { type: 'text-delta' }> =>
          chunk.type === 'text-delta',
      )
      .map((chunk) => chunk.delta)
      .join('');
    expect(text).toBe('first last');
    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
  });

  it("still reports a Google that never sends headers as the caller's timeout", async () => {
    const adapter = createGoogleAdapter({
      apiKey: 'test-key',
      skipDiscovery: true,
      headersTimeoutMs: HEADERS_TIMEOUT_MS,
      fetch: (async (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })) as unknown as typeof fetch,
    });

    const caller = new AbortController();
    const stream = adapter.stream(
      { model: GOOGLE_DEFAULT_MODEL_ID, messages: [{ role: 'user', content: 'hi' }] } as never,
      caller.signal,
    );
    const drained = collect(stream);
    caller.abort(new DOMException('The user stopped the turn.', 'AbortError'));

    const chunks = await drained;
    expect(chunks[0]?.type).toBe('error');
  });
});
