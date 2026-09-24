import { describe, expect, it } from 'vitest';

import type { ChatRequest, StreamChunk } from '@agiworkforce/types';

import { LMSTUDIO_DEFAULT_BASE_URL, createLMStudioAdapter } from '../index';

const MODEL_ID = 'fixture-model';
const LOCAL_KEY_PLACEHOLDER = 'lm-studio';

function request(): ChatRequest {
  return {
    model: MODEL_ID,
    messages: [
      { role: 'system', content: 'Answer briefly.' },
      { role: 'user', content: 'ping' },
    ],
  };
}

function chunkEvent(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return JSON.stringify({
    id: 'chatcmpl-local',
    object: 'chat.completion.chunk',
    created: 0,
    model: MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
}

function sseResponse(events: readonly string[]): Response {
  const body = `${events.map((event) => `data: ${event}`).join('\n\n')}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

describe('LM Studio request mapping', () => {
  it('posts an OpenAI-shaped streaming body to the local server with the placeholder key', async () => {
    let seenUrl = '';
    let seenAuth: string | null = null;
    let seenBody: Record<string, unknown> = {};
    const adapter = createLMStudioAdapter({
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuth = new Headers(init?.headers).get('authorization');
        seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return sseResponse([chunkEvent({ content: 'pong' }, 'stop')]);
      },
    });

    await collect(adapter.stream(request(), new AbortController().signal));

    expect(seenUrl).toBe(`${LMSTUDIO_DEFAULT_BASE_URL}/chat/completions`);
    expect(seenAuth).toBe(`Bearer ${LOCAL_KEY_PLACEHOLDER}`);
    expect(seenBody).toMatchObject({
      model: MODEL_ID,
      stream: true,
      messages: [
        { role: 'system', content: 'Answer briefly.' },
        { role: 'user', content: 'ping' },
      ],
    });
  });

  it('sends a configured key and base URL instead of the defaults', async () => {
    const baseUrl = 'http://127.0.0.1:4321/v1';
    let seenUrl = '';
    let seenAuth: string | null = null;
    const adapter = createLMStudioAdapter({
      apiKey: 'configured-local-key',
      baseUrl,
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuth = new Headers(init?.headers).get('authorization');
        return sseResponse([chunkEvent({ content: 'pong' }, 'stop')]);
      },
    });

    await collect(adapter.stream(request(), new AbortController().signal));

    expect(seenUrl).toBe(`${baseUrl}/chat/completions`);
    expect(seenAuth).toBe('Bearer configured-local-key');
  });
});

describe('LM Studio response mapping', () => {
  it('turns content deltas into text deltas and ends the turn cleanly', async () => {
    const adapter = createLMStudioAdapter({
      fetch: async () =>
        sseResponse([
          chunkEvent({ role: 'assistant', content: 'po' }),
          chunkEvent({ content: 'ng' }),
          chunkEvent({}, 'stop'),
        ]),
    });

    const chunks = await collect(adapter.stream(request(), new AbortController().signal));

    expect(chunks.filter((chunk) => chunk.type === 'text-delta')).toEqual([
      { type: 'text-delta', delta: 'po' },
      { type: 'text-delta', delta: 'ng' },
    ]);
    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
    expect(chunks.at(-1)?.type).toBe('stop');
  });

  it('reports a refused request as a non-retryable error and still stops the stream', async () => {
    const adapter = createLMStudioAdapter({
      fetch: async () => jsonResponse(403, { error: { message: 'forbidden' } }),
    });

    const chunks = await collect(adapter.stream(request(), new AbortController().signal));

    expect(chunks.find((chunk) => chunk.type === 'error')).toMatchObject({
      type: 'error',
      code: '403',
      retryable: false,
    });
    expect(chunks.at(-1)).toEqual({ type: 'stop', reason: 'error' });
  });
});

describe('LM Studio catalog', () => {
  it('lists the models the local server has loaded, keyed to this provider', async () => {
    let seenUrl = '';
    const adapter = createLMStudioAdapter({
      fetch: async (input) => {
        seenUrl = String(input);
        return jsonResponse(200, {
          object: 'list',
          data: [
            { id: MODEL_ID, object: 'model', owned_by: 'organization_owner' },
            { object: 'model', owned_by: 'organization_owner' },
          ],
        });
      },
    });

    await expect(adapter.catalog()).resolves.toEqual([{ id: MODEL_ID, provider: 'lmstudio' }]);
    expect(seenUrl).toBe(`${LMSTUDIO_DEFAULT_BASE_URL}/models`);
  });

  it('offers no models when the local server does not answer the listing', async () => {
    const adapter = createLMStudioAdapter({
      fetch: async () => jsonResponse(404, { error: { message: 'not found' } }),
    });

    await expect(adapter.catalog()).resolves.toEqual([]);
  });
});
