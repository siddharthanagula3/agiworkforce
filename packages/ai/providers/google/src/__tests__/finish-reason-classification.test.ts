import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import { parseGeminiStream, translateGeminiStream } from '../stream';

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

describe('translateGeminiStream finish reason classification', () => {
  it('maps a SAFETY-blocked candidate with no text to a refusal stop and no text-delta chunks', async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[]},"finishReason":"SAFETY","index":0}]}\n\n';

    const chunks = await collect(sse);

    expect(chunks.some((c) => c.type === 'text-delta')).toBe(false);
    expect(chunks.at(-1)).toEqual({
      type: 'stop',
      reason: 'refusal',
      providerFinishReason: 'SAFETY',
    });
  });

  it('carries the promptFeedback block reason as the terminal stop when no candidate ever arrives', async () => {
    const sse = 'data: {"promptFeedback":{"blockReason":"PROHIBITED_CONTENT"}}\n\n';

    const chunks = await collect(sse);

    const errorChunk = chunks.find(
      (c): c is Extract<StreamChunk, { type: 'error' }> => c.type === 'error',
    );
    expect(errorChunk).toMatchObject({ code: 'prompt_blocked' });
    expect(chunks.at(-1)).toEqual({
      type: 'stop',
      reason: 'refusal',
      providerFinishReason: 'PROHIBITED_CONTENT',
    });
  });

  it('emits only thinking-delta chunks, thoughts usage, and a max_tokens stop for a thoughts-only MAX_TOKENS turn', async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"reasoning about the request","thought":true}]},' +
      '"finishReason":"MAX_TOKENS","index":0}],"usageMetadata":{"promptTokenCount":120,' +
      '"candidatesTokenCount":0,"thoughtsTokenCount":8192,"totalTokenCount":8312}}\n\n';

    const chunks = await collect(sse);

    expect(chunks.some((c) => c.type === 'text-delta')).toBe(false);
    const thinking = chunks.filter(
      (c): c is Extract<StreamChunk, { type: 'thinking-delta' }> => c.type === 'thinking-delta',
    );
    expect(thinking.map((c) => c.delta).join('')).toBe('reasoning about the request');

    expect(chunks.find((c) => c.type === 'usage')).toEqual({
      type: 'usage',
      inputTokens: 120,
      outputTokens: 0,
      reasoningTokens: 8192,
    });

    expect(chunks.at(-1)).toEqual({
      type: 'stop',
      reason: 'max_tokens',
      providerFinishReason: 'MAX_TOKENS',
    });
  });

  it.each([
    ['STOP', 'end_turn'],
    ['MAX_TOKENS', 'max_tokens'],
    ['SAFETY', 'refusal'],
    ['RECITATION', 'refusal'],
    ['PROHIBITED_CONTENT', 'refusal'],
    ['BLOCKLIST', 'refusal'],
    ['OTHER', 'error'],
  ] as const)(
    'maps candidate finishReason %s to stop reason %s',
    async (geminiReason, stopReason) => {
      const sse = `data: {"candidates":[{"content":{"parts":[]},"finishReason":"${geminiReason}","index":0}]}\n\n`;

      const chunks = await collect(sse);

      expect(chunks.at(-1)).toEqual({
        type: 'stop',
        reason: stopReason,
        providerFinishReason: geminiReason,
      });
    },
  );
});
