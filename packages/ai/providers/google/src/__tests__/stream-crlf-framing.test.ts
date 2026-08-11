import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import { parseGeminiStream, translateGeminiStream } from '../stream';

/**
 * CRLF SSE framing regression test (release blocker found on a live deep
 * research run, 2026-07-10): the LIVE Gemini `alt=sse` wire separates frames
 * with `\r\n\r\n`, not `\n\n`. The parser's LF-only frame split never
 * matched, so every real chunk accumulated into the trailing buffer as one
 * unparseable multi-event blob -> PARSE_ERROR_SENTINEL -> text, grounding,
 * and usage all silently dropped (the assembled wire carried ONLY a
 * synthetic stop). LF-framed recorded fixtures kept byte-parity tests green,
 * which is why this test pins the REAL recorded CRLF bytes.
 */

// Recorded from a real Google `alt=sse` response (2026-07-10, live
// wire probe; thoughtSignature truncated -- its value is irrelevant to
// framing). Byte-for-byte framing preserved: `\r\n\r\n` between events.
const LIVE_CRLF_SSE =
  'data: {"candidates": [{"content": {"parts": [{"text": "Hello wire probe."}],"role": "model"},"index": 0}],' +
  '"usageMetadata": {"promptTokenCount": 9,"candidatesTokenCount": 4,"totalTokenCount": 94,' +
  '"promptTokensDetails": [{"modality": "TEXT","tokenCount": 9}],"thoughtsTokenCount": 81,' +
  '"serviceTier": "standard"},"modelVersion": "fixture-google-model-version","responseId": "XCZRarmyK9jQz7IP"}\r\n\r\n' +
  'data: {"candidates": [{"content": {"parts": [{"text": "","thoughtSignature": "EqMDCqADARFNMg9Z"}],' +
  '"role": "model"},"finishReason": "STOP","index": 0}],' +
  '"usageMetadata": {"promptTokenCount": 9,"candidatesTokenCount": 4,"totalTokenCount": 94,' +
  '"promptTokensDetails": [{"modality": "TEXT","tokenCount": 9}],"thoughtsTokenCount": 81,' +
  '"serviceTier": "standard"},"modelVersion": "fixture-google-model-version","responseId": "XCZRarmyK9jQz7IP"}\r\n\r\n';

// Gemini may stream a complete functionCall before a later, separate terminal
// chunk carries finishReason:STOP. The tool turn must remain a tool turn even
// when the terminal chunk only contains a thought signature.
const SPLIT_TOOL_CALL_SSE =
  'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"execute_code","args":{"code":"print(50)"}}}],"role":"model"},"index":0}]}\r\n\r\n' +
  'data: {"candidates":[{"content":{"parts":[{"text":"","thoughtSignature":"signed"}],"role":"model"},"finishReason":"STOP","index":0}],"usageMetadata":{"promptTokenCount":12,"candidatesTokenCount":8}}\r\n\r\n';

function bytesToStream(
  text: string,
  chunkSize = Number.POSITIVE_INFINITY,
): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += Math.min(chunkSize, bytes.length)) {
        controller.enqueue(bytes.slice(i, i + Math.min(chunkSize, bytes.length)));
      }
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

describe('parseGeminiStream CRLF framing (live wire shape)', () => {
  it('parses real CRLF-framed SSE: text, usage, and stop all survive', async () => {
    const chunks = await collect(bytesToStream(LIVE_CRLF_SSE));

    const text = chunks
      .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(text).toBe('Hello wire probe.');

    const usage = chunks.find((c) => c.type === 'usage');
    expect(usage).toMatchObject({ inputTokens: 9, outputTokens: 4, reasoningTokens: 81 });

    expect(chunks[chunks.length - 1]).toEqual({ type: 'stop', reason: 'end_turn' });
  });

  it('parses CRLF frames split at arbitrary byte boundaries (including mid-CRLF)', async () => {
    // 3-byte reads guarantee `\r\n\r\n` separators are split across reads.
    const chunks = await collect(bytesToStream(LIVE_CRLF_SSE, 3));
    const text = chunks
      .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(text).toBe('Hello wire probe.');
    expect(chunks.some((c) => c.type === 'usage')).toBe(true);
  });

  it('still parses LF-framed SSE (recorded-fixture shape) identically', async () => {
    const lfSse = LIVE_CRLF_SSE.replace(/\r\n/g, '\n');
    const chunks = await collect(bytesToStream(lfSse));
    const text = chunks
      .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(text).toBe('Hello wire probe.');
  });

  it('keeps a function call as tool_use when STOP arrives in a later chunk', async () => {
    const chunks = await collect(bytesToStream(SPLIT_TOOL_CALL_SSE));

    expect(chunks).toEqual(
      expect.arrayContaining([
        { type: 'tool-use-start', toolUseId: 'gemini-tool-1', name: 'execute_code' },
        {
          type: 'tool-use-delta',
          toolUseId: 'gemini-tool-1',
          deltaJson: '{"code":"print(50)"}',
        },
        { type: 'tool-use-end', toolUseId: 'gemini-tool-1' },
      ]),
    );
    expect(chunks.at(-1)).toEqual({ type: 'stop', reason: 'tool_use' });
  });
});
