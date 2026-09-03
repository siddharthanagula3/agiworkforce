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

function citationDeltas(
  chunks: StreamChunk[],
): Array<Extract<StreamChunk, { type: 'citation-delta' }>> {
  return chunks.filter(
    (chunk): chunk is Extract<StreamChunk, { type: 'citation-delta' }> =>
      chunk.type === 'citation-delta',
  );
}

describe('Gemini grounding citation deltas', () => {
  it('emits one deduped citation-delta per grounding-support segment, only when the final chunk carries grounding metadata', async () => {
    const textOnlyChunk =
      'data: {"candidates":[{"content":{"parts":[{"text":"Water boils at sea level."}],"role":"model"},"index":0}]}\n\n';
    const groundedFinalChunk =
      'data: {"candidates":[{"content":{"parts":[{"text":""}],"role":"model"},' +
      '"groundingMetadata":{' +
      '"groundingChunks":[' +
      '{"web":{"uri":"https://example.com/a","title":"Source A"}},' +
      '{"web":{"uri":"https://example.com/b","title":"Source B"}}' +
      '],' +
      '"groundingSupports":[' +
      '{"segment":{"startIndex":0,"endIndex":12,"text":"Water boils"},"groundingChunkIndices":[0]},' +
      '{"segment":{"startIndex":13,"endIndex":30,"text":"at sea level"},"groundingChunkIndices":[0,1]}' +
      ']' +
      '},' +
      '"urlContextMetadata":{"urlMetadata":[' +
      '{"retrievedUrl":"https://example.com/c","urlRetrievalStatus":"URL_RETRIEVAL_STATUS_SUCCESS"},' +
      '{"retrievedUrl":"https://example.com/d","urlRetrievalStatus":"URL_RETRIEVAL_STATUS_ERROR"}' +
      ']},' +
      '"finishReason":"STOP","index":0}]}\n\n';

    const chunks = await collect(textOnlyChunk + groundedFinalChunk);
    const citations = citationDeltas(chunks);

    expect(citations).toEqual([
      {
        type: 'citation-delta',
        blockIndex: 0,
        payload: {
          type: 'url_citation',
          url: 'https://example.com/a',
          title: 'Source A',
          start_index: 0,
          end_index: 12,
        },
      },
      {
        type: 'citation-delta',
        blockIndex: 0,
        payload: {
          type: 'url_citation',
          url: 'https://example.com/b',
          title: 'Source B',
          start_index: 13,
          end_index: 30,
        },
      },
      {
        type: 'citation-delta',
        blockIndex: 0,
        payload: {
          type: 'url_citation',
          url: 'https://example.com/c',
          title: 'example.com',
        },
      },
    ]);
  });

  it('emits nothing extra when no grounding metadata is present', async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"Plain answer."}],"role":"model"},' +
      '"finishReason":"STOP","index":0}]}\n\n';

    const chunks = await collect(sse);
    expect(citationDeltas(chunks)).toEqual([]);
    expect(chunks.find((c) => c.type === 'server-tool-result')).toBeUndefined();
  });
});
