import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { translateOllamaStream } from '../stream';
import type { OllamaChatStreamChunk } from '../types';

const FIXTURE_MODEL_ID = 'fixture-ollama-model';

async function* fromArray(records: OllamaChatStreamChunk[]): AsyncIterable<OllamaChatStreamChunk> {
  for (const r of records) yield r;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe('translateOllamaStream, truncation safety (P1-3)', () => {
  it('emits a fallback stop chunk when the NDJSON stream drains without done:true', async () => {
    const records: OllamaChatStreamChunk[] = [
      {
        model: FIXTURE_MODEL_ID,
        message: { role: 'assistant', content: 'Hello' },
        done: false,
      } as OllamaChatStreamChunk,
      {
        model: FIXTURE_MODEL_ID,
        message: { role: 'assistant', content: ' world' },
        done: false,
      } as OllamaChatStreamChunk,
    ];
    const out = await collect(translateOllamaStream(fromArray(records)));
    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toEqual({ type: 'stop', reason: 'end_turn' });
    const texts = out.filter((c) => c.type === 'text-delta');
    expect(texts).toHaveLength(2);
  });

  it('does NOT emit a duplicate stop chunk when done:true closed the stream cleanly', async () => {
    const records: OllamaChatStreamChunk[] = [
      {
        model: FIXTURE_MODEL_ID,
        message: { role: 'assistant', content: 'Hi' },
        done: false,
      } as OllamaChatStreamChunk,
      {
        model: FIXTURE_MODEL_ID,
        message: { role: 'assistant', content: '' },
        done: true,
        done_reason: 'stop',
      } as OllamaChatStreamChunk,
    ];
    const out = await collect(translateOllamaStream(fromArray(records)));
    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toEqual({ type: 'stop', reason: 'end_turn' });
  });

  it('still emits a fallback stop when the iterator throws partway through', async () => {
    async function* throwingStream(): AsyncIterable<OllamaChatStreamChunk> {
      yield {
        model: FIXTURE_MODEL_ID,
        message: { role: 'assistant', content: 'partial' },
        done: false,
      } as OllamaChatStreamChunk;
      throw new Error('network drop');
    }
    const collected: StreamChunk[] = [];
    let caught: unknown = null;
    try {
      for await (const c of translateOllamaStream(throwingStream())) {
        collected.push(c);
      }
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const stops = collected.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
  });
});
