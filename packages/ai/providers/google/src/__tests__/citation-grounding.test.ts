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

  it('keeps every grounded outlet when a later chunk widens the grounding list', async () => {
    const firstGrounded =
      'data: {"candidates":[{"content":{"parts":[{"text":"Headline one."}],"role":"model"},' +
      '"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://a.example/1","title":"Outlet A"}}]},' +
      '"index":0}]}\n\n';
    const secondGrounded =
      'data: {"candidates":[{"content":{"parts":[{"text":" Headline two."}],"role":"model"},' +
      '"groundingMetadata":{"groundingChunks":[' +
      '{"web":{"uri":"https://a.example/1","title":"Outlet A"}},' +
      '{"web":{"uri":"https://b.example/2","title":"Outlet B"}}' +
      ']},' +
      '"finishReason":"STOP","index":0}]}\n\n';

    const chunks = await collect(firstGrounded + secondGrounded);
    const grounded = chunks.filter(
      (chunk): chunk is Extract<StreamChunk, { type: 'server-tool-result' }> =>
        chunk.type === 'server-tool-result',
    );

    expect(grounded).toHaveLength(2);
    expect((grounded[1]?.payload as { results: unknown[] }).results).toEqual([
      { type: 'web_search_result', url: 'https://a.example/1', title: 'Outlet A', position: 1 },
      { type: 'web_search_result', url: 'https://b.example/2', title: 'Outlet B', position: 2 },
    ]);
  });

  it('derives citation spans from grounding supports, located by the segment text', async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"Rates held steady. Growth slowed."}],"role":"model"},' +
      '"groundingMetadata":{"groundingChunks":[' +
      '{"web":{"uri":"https://a.example/1","title":"Outlet A"}},' +
      '{"web":{"uri":"https://b.example/2","title":"Outlet B"}}' +
      '],' +
      '"groundingSupports":[' +
      '{"segment":{"startIndex":0,"endIndex":18,"text":"Rates held steady."},"groundingChunkIndices":[0]},' +
      '{"segment":{"startIndex":9999,"endIndex":9999,"text":"Growth slowed."},"groundingChunkIndices":[1,0]}' +
      ']},' +
      '"finishReason":"STOP","index":0}]}\n\n';

    const chunks = await collect(sse);
    const grounded = chunks.find((chunk) => chunk.type === 'server-tool-result');

    expect((grounded?.payload as { citationSpans: unknown }).citationSpans).toEqual([
      { endIndex: 18, positions: [1] },
      { endIndex: 33, positions: [1, 2] },
    ]);
  });

  it('drops a grounding support whose segment text is nowhere in the answer', async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"Rates held steady."}],"role":"model"},' +
      '"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://a.example/1","title":"Outlet A"}}],' +
      '"groundingSupports":[' +
      '{"segment":{"startIndex":0,"endIndex":10,"text":"never written"},"groundingChunkIndices":[0]}' +
      ']},' +
      '"finishReason":"STOP","index":0}]}\n\n';

    const chunks = await collect(sse);
    const grounded = chunks.find((chunk) => chunk.type === 'server-tool-result');

    expect(grounded?.payload).not.toHaveProperty('citationSpans');
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
