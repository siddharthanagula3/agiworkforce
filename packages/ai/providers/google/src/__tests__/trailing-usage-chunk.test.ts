import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import { parseGeminiStream, translateGeminiStream } from '../stream';

const RECORDED_CACHED_TURN_SSE =
  'data: {"candidates": [{"content": {"parts": [{"text": "Gemini implicit caching applies above the "}],' +
  '"role": "model"},"index": 0}],"modelVersion": "gemini-3.8-flash","responseId": "trailing-usage-1"}\n\n' +
  'data: {"candidates": [{"content": {"parts": [{"text": "per-model token floor."}],"role": "model"},' +
  '"finishReason": "STOP","index": 0}],"modelVersion": "gemini-3.8-flash","responseId": "trailing-usage-1"}\n\n' +
  'data: {"candidates": [],"usageMetadata": {"promptTokenCount": 5796,"candidatesTokenCount": 68,' +
  '"totalTokenCount": 6356,"cachedContentTokenCount": 5620,"thoughtsTokenCount": 492,' +
  '"promptTokensDetails": [{"modality": "TEXT","tokenCount": 5796}]},"modelVersion": "gemini-3.8-flash",' +
  '"responseId": "trailing-usage-1"}\n\n';

function bytesToStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of translateGeminiStream(parseGeminiStream(stream))) {
    out.push(chunk);
  }
  return out;
}

describe('translateGeminiStream trailing usage-only chunk', () => {
  it('carries prompt, completion, cache read, and thoughts tokens from a chunk with empty candidates', async () => {
    const chunks = await collect(bytesToStream(RECORDED_CACHED_TURN_SSE));

    const text = chunks
      .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(text).toBe('Gemini implicit caching applies above the per-model token floor.');

    const usage = chunks.find((c) => c.type === 'usage');
    expect(usage).toEqual({
      type: 'usage',
      inputTokens: 5796,
      outputTokens: 68,
      cacheReadTokens: 5620,
      reasoningTokens: 492,
    });

    const usageIndex = chunks.findIndex((c) => c.type === 'usage');
    const stopIndex = chunks.findIndex((c) => c.type === 'stop');
    expect(usageIndex).toBeGreaterThanOrEqual(0);
    expect(stopIndex).toBeGreaterThan(usageIndex);
  });
});
