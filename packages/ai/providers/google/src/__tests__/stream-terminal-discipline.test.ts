import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { parseGeminiStream, translateGeminiStream } from '../stream';
import { GOOGLE_DEFAULT_MODEL_ID } from './model-fixtures';

function bytesToStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collect(text: string): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of translateGeminiStream(parseGeminiStream(bytesToStream(text)))) {
    out.push(chunk);
  }
  return out;
}

function textFrame(text: string, finishReason?: string): string {
  const candidate = {
    content: { role: 'model', parts: [{ text }] },
    index: 0,
    ...(finishReason !== undefined ? { finishReason } : {}),
  };
  return `data: ${JSON.stringify({ candidates: [candidate], modelVersion: GOOGLE_DEFAULT_MODEL_ID })}\n\n`;
}

describe('translateGeminiStream terminal discipline', () => {
  it('ends a clean turn with one stop after the usage', async () => {
    const out = await collect(
      textFrame('Half ') +
        textFrame('an answer.', 'STOP') +
        `data: {"candidates": [],"usageMetadata": {"promptTokenCount": 4,"candidatesTokenCount": 3}}\n\n`,
    );

    expect(out.filter((c) => c.type === 'stop')).toHaveLength(1);
    expect(out[out.length - 1]).toEqual({
      type: 'stop',
      reason: 'end_turn',
      providerFinishReason: 'STOP',
    });
    expect(out.findIndex((c) => c.type === 'usage')).toBe(out.length - 2);
  });

  it('reports a torn frame as a failed turn rather than a finished answer', async () => {
    const out = await collect(textFrame('Half ') + 'data: {"candidates": [{"content"\n\n');

    const texts = out.filter(
      (c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta',
    );
    expect(texts.map((c) => c.delta)).toEqual(['Half ']);
    expect(out.some((c) => c.type === 'error')).toBe(true);

    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ type: 'stop', reason: 'error' });
    expect(out[out.length - 1]?.type).toBe('stop');
  });

  it('does not let a finish reason seen before the torn frame pass the turn as complete', async () => {
    const out = await collect(
      textFrame('All of it, apparently.', 'STOP') + 'data: {"candidates": [{"content"\n\n',
    );

    expect(out.some((c) => c.type === 'error')).toBe(true);
    expect(out[out.length - 1]).toMatchObject({ type: 'stop', reason: 'error' });
  });

  it('keeps a safety block distinguishable from a turn that called a tool', async () => {
    const toolFrame = `data: ${JSON.stringify({
      candidates: [
        {
          content: { role: 'model', parts: [{ functionCall: { name: 'lookup', args: {} } }] },
          index: 0,
        },
      ],
    })}\n\n`;
    const out = await collect(toolFrame + textFrame('', 'SAFETY'));

    expect(out[out.length - 1]).toEqual({
      type: 'stop',
      reason: 'refusal',
      providerFinishReason: 'SAFETY',
    });
  });

  it('still reports tool use when the vendor closes a tool turn with STOP', async () => {
    const toolFrame = `data: ${JSON.stringify({
      candidates: [
        {
          content: { role: 'model', parts: [{ functionCall: { name: 'lookup', args: {} } }] },
          index: 0,
          finishReason: 'STOP',
        },
      ],
    })}\n\n`;
    const out = await collect(toolFrame);

    expect(out[out.length - 1]).toMatchObject({ type: 'stop', reason: 'tool_use' });
  });
});
