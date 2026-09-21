import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { createOpenRouterAdapter } from '../index';

const TEST_MODEL_ID = 'router/example-model';

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function frame(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function contentFrame(content: string, finishReason: string | null = null): string {
  return frame({
    id: 'gen-1',
    object: 'chat.completion.chunk',
    model: TEST_MODEL_ID,
    choices: [{ index: 0, delta: { content }, finish_reason: finishReason }],
  });
}

async function streamOf(body: string): Promise<StreamChunk[]> {
  const adapter = createOpenRouterAdapter({
    apiKey: 'test-key',
    fetch: async () => sseResponse(body),
  });
  const out: StreamChunk[] = [];
  for await (const chunk of adapter.stream(
    { model: TEST_MODEL_ID, messages: [{ role: 'user', content: 'hi' }] },
    new AbortController().signal,
  )) {
    out.push(chunk);
  }
  return out;
}

function texts(chunks: StreamChunk[]): string[] {
  return chunks
    .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
    .map((c) => c.delta);
}

function failure(chunks: StreamChunk[]): Extract<StreamChunk, { type: 'error' }> | undefined {
  return chunks.find((c): c is Extract<StreamChunk, { type: 'error' }> => c.type === 'error');
}

describe('the OpenRouter stream, as the router actually closes it', () => {
  it('reads a keep-alive comment, a finish reason and a usage-only tail as one clean answer', async () => {
    const chunks = await streamOf(
      ': OPENROUTER PROCESSING\n\n' +
        contentFrame('All ') +
        ': OPENROUTER PROCESSING\n\n' +
        contentFrame('done.', 'stop') +
        frame({
          id: 'gen-1',
          choices: [],
          usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 },
        }) +
        'data: [DONE]\n\n',
    );

    expect(texts(chunks)).toEqual(['All ', 'done.']);
    expect(failure(chunks)).toBeUndefined();
    expect(chunks.filter((c) => c.type === 'stop')).toEqual([{ type: 'stop', reason: 'end_turn' }]);
    expect(chunks.find((c) => c.type === 'usage')).toMatchObject({
      inputTokens: 7,
      outputTokens: 2,
    });
  });

  it('reports a stream that just stops mid-answer as a failure, keeping the text', async () => {
    const chunks = await streamOf(contentFrame('Half an ans'));

    expect(texts(chunks)).toEqual(['Half an ans']);
    expect(failure(chunks)?.classification).toMatchObject({
      category: 'connection',
      retryable: true,
    });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'stop', reason: 'error' });
  });

  it('reports the router’s own error finish reason as a failure, not as a finished answer', async () => {
    const chunks = await streamOf(
      contentFrame('Half') +
        frame({
          id: 'gen-1',
          choices: [{ index: 0, delta: {}, finish_reason: 'error', native_finish_reason: 'error' }],
        }) +
        'data: [DONE]\n\n',
    );

    expect(texts(chunks)).toEqual(['Half']);
    expect(failure(chunks)).toBeDefined();
    expect(chunks[chunks.length - 1]).toEqual({ type: 'stop', reason: 'error' });
  });

  it('reports a mid-stream error object inside a 200 as a failure', async () => {
    const chunks = await streamOf(
      contentFrame('Half') +
        frame({ error: { code: 429, message: 'rate limited by the upstream provider' } }),
    );

    expect(texts(chunks)).toEqual(['Half']);
    expect(failure(chunks)?.classification).toMatchObject({ category: 'rate_limit' });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'stop', reason: 'error' });
  });

  it('ignores a usage-only chunk with no choices while the answer is still running', async () => {
    const chunks = await streamOf(
      frame({ id: 'gen-1', choices: [], usage: { prompt_tokens: 3 } }) +
        contentFrame('Answer.', 'stop') +
        'data: [DONE]\n\n',
    );

    expect(texts(chunks)).toEqual(['Answer.']);
    expect(failure(chunks)).toBeUndefined();
  });
});
