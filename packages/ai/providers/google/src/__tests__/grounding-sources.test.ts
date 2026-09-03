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

describe('Gemini grounding chunk titles', () => {
  it('leaves the title empty rather than falling back to the uri when Google sends none', async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"See the source."}],"role":"model"},' +
      '"groundingMetadata":{"groundingChunks":[' +
      '{"web":{"uri":"https://example.com/titled","title":"A Real Title"}},' +
      '{"web":{"uri":"https://example.com/untitled"}}' +
      ']},"finishReason":"STOP","index":0}]}\n\n';

    const chunks = await collect(sse);
    const result = chunks.find(
      (c): c is Extract<StreamChunk, { type: 'server-tool-result' }> =>
        c.type === 'server-tool-result',
    );
    expect(result).toBeDefined();
    const payload = result?.payload as { results?: Array<{ url: string; title: string }> };
    expect(payload.results).toEqual([
      {
        type: 'web_search_result',
        url: 'https://example.com/titled',
        title: 'A Real Title',
        position: 1,
      },
      { type: 'web_search_result', url: 'https://example.com/untitled', title: '', position: 2 },
    ]);
  });

  it('emits a citation-delta per grounding chunk, falling back to the hostname when Google sends no title', async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"See the source."}],"role":"model"},' +
      '"groundingMetadata":{"groundingChunks":[' +
      '{"web":{"uri":"https://example.com/titled","title":"A Real Title"}},' +
      '{"web":{"uri":"https://example.com/untitled"}}' +
      ']},"finishReason":"STOP","index":0}]}\n\n';

    const chunks = await collect(sse);
    const citations = chunks.filter(
      (c): c is Extract<StreamChunk, { type: 'citation-delta' }> => c.type === 'citation-delta',
    );
    expect(citations).toEqual([
      {
        type: 'citation-delta',
        blockIndex: 0,
        payload: { type: 'url_citation', url: 'https://example.com/titled', title: 'A Real Title' },
      },
      {
        type: 'citation-delta',
        blockIndex: 0,
        payload: {
          type: 'url_citation',
          url: 'https://example.com/untitled',
          title: 'example.com',
        },
      },
    ]);
  });
});
