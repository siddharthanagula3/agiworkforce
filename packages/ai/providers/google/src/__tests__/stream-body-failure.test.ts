import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import { createGoogleAdapter } from '../index';
import { GOOGLE_DEFAULT_MODEL_ID } from './model-fixtures';

const FIRST_LINE =
  'data: {"candidates":[{"content":{"parts":[{"text":"Half an"}],"role":"model"},"index":0}]}\n\n';

function bodyThatDiesAfterTheFirstLine(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let sentFirst = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sentFirst) {
        sentFirst = true;
        controller.enqueue(encoder.encode(FIRST_LINE));
        return;
      }
      controller.error(new TypeError('terminated'));
    },
  });
}

describe('a Google body that dies after the headers', () => {
  it('ends the turn as a classified failure and keeps the text that arrived', async () => {
    const adapter = createGoogleAdapter({
      apiKey: 'test-key',
      skipDiscovery: true,
      fetch: (async () =>
        new Response(bodyThatDiesAfterTheFirstLine(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })) as unknown as typeof fetch,
    });

    const chunks: StreamChunk[] = [];
    for await (const chunk of adapter.stream(
      { model: GOOGLE_DEFAULT_MODEL_ID, messages: [{ role: 'user', content: 'hi' }] } as never,
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    const text = chunks
      .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(text).toBe('Half an');

    const error = chunks.find(
      (c): c is Extract<StreamChunk, { type: 'error' }> => c.type === 'error',
    );
    expect(error).toBeDefined();
    expect(error?.classification).toMatchObject({ category: 'connection', retryable: true });

    const stops = chunks.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'stop', reason: 'error' });
  });
});
