import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { parseOllamaStream, translateOllamaStream } from '../stream';
import type { OllamaChatStreamChunk } from '../types';

const FIXTURE_MODEL_ID = 'fixture-ollama-model';

function bytesToStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const item of stream) out.push(item);
  return out;
}

function line(message: string, done = false, doneReason?: string): string {
  return `${JSON.stringify({
    model: FIXTURE_MODEL_ID,
    created_at: '2026-01-01T00:00:00Z',
    message: { role: 'assistant', content: message },
    done,
    ...(doneReason !== undefined ? { done_reason: doneReason } : {}),
  })}\n`;
}

describe('translateOllamaStream terminal discipline', () => {
  it('reports a torn NDJSON line as a failed turn rather than a finished answer', async () => {
    const out = await collect(
      translateOllamaStream(parseOllamaStream(bytesToStream(line('Half ') + '{"message":{"con\n'))),
    );

    expect(
      out
        .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
        .map((c) => c.delta),
    ).toEqual(['Half ']);
    expect(out.some((c) => c.type === 'error')).toBe(true);

    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ type: 'stop', reason: 'error' });
    expect(out[out.length - 1]?.type).toBe('stop');
  });

  it('emits nothing after the first done frame closes the turn', async () => {
    const out = await collect(
      translateOllamaStream(
        parseOllamaStream(
          bytesToStream(
            line('Hi', false) + line('', true, 'stop') + line(' extra', true, 'length'),
          ),
        ),
      ),
    );

    expect(out.filter((c) => c.type === 'stop')).toHaveLength(1);
    expect(out[out.length - 1]).toEqual({ type: 'stop', reason: 'end_turn' });
    expect(
      out
        .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
        .map((c) => c.delta),
    ).toEqual(['Hi']);
  });

  it('puts the usage of a clean turn before its stop', async () => {
    async function* records(): AsyncIterable<OllamaChatStreamChunk> {
      yield {
        model: FIXTURE_MODEL_ID,
        message: { role: 'assistant', content: 'Hi' },
        done: false,
      } as OllamaChatStreamChunk;
      yield {
        model: FIXTURE_MODEL_ID,
        done: true,
        done_reason: 'length',
        prompt_eval_count: 7,
        eval_count: 2,
      } as OllamaChatStreamChunk;
    }
    const out = await collect(translateOllamaStream(records()));

    expect(out.map((c) => c.type)).toEqual(['text-delta', 'usage', 'stop']);
    expect(out[1]).toMatchObject({ inputTokens: 7, outputTokens: 2 });
    expect(out[2]).toEqual({ type: 'stop', reason: 'max_tokens' });
  });
});
