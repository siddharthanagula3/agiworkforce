import { describe, expect, it } from 'vitest';

import {
  MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
  ManagedCloudMessageMetadataSchema,
  managedCloudMetadataLength,
} from '../conversations';
import {
  METADATA_TRUNCATED_KEY,
  PERSISTED_METADATA_MAX_SNIPPET_CHARS,
  PERSISTED_METADATA_MAX_SOURCES,
  PERSISTED_METADATA_MAX_THINKING_CHARS,
  PERSISTED_METADATA_MAX_TOOLS,
  projectPersistedMessageMetadata,
} from '../message-metadata-projection';

function source(index: number, snippetChars = 4_000): Record<string, unknown> {
  return {
    title: `Result ${index} `.repeat(60),
    url: `https://example.com/${index}`,
    snippet: 'x'.repeat(snippetChars),
    favicon: `data:image/png;base64,${'A'.repeat(4_000)}`,
    source: 'Example Publisher',
    publishedDate: '2026-09-01',
  };
}

describe('projectPersistedMessageMetadata', () => {
  it('passes undefined through so a turn with nothing to save still sends nothing', () => {
    expect(projectPersistedMessageMetadata(undefined)).toBeUndefined();
  });

  it('keeps the three fields a source card renders and drops the derivable favicon', () => {
    const projected = projectPersistedMessageMetadata({
      searchResults: { query: 'q', results: [source(1)], timestamp: '2026-09-13T00:00:00.000Z' },
    });
    const results = (projected?.['searchResults'] as { results: Record<string, unknown>[] })
      .results;
    expect(results[0]).toMatchObject({
      url: 'https://example.com/1',
      source: 'Example Publisher',
      publishedDate: '2026-09-01',
    });
    expect(results[0]?.['favicon']).toBeUndefined();
    expect(String(results[0]?.['snippet'])).toHaveLength(PERSISTED_METADATA_MAX_SNIPPET_CHARS);
  });

  it('caps the source list, the citation list and the tool timeline', () => {
    const projected = projectPersistedMessageMetadata({
      searchResults: Array.from({ length: 90 }, (_, i) => ({
        title: `Result ${i}`,
        url: `https://example.com/${i}`,
        snippet: 'short',
      })),
      citations: Array.from({ length: 90 }, (_, i) => ({
        type: 'url_citation',
        url: `https://example.com/${i}`,
        title: 'T',
      })),
      tools: Array.from({ length: 200 }, () => ({ name: 'web_search', status: 'completed' })),
    });
    expect(projected?.['searchResults']).toHaveLength(PERSISTED_METADATA_MAX_SOURCES);
    expect(projected?.['citations']).toHaveLength(PERSISTED_METADATA_MAX_SOURCES);
    expect(projected?.['tools']).toHaveLength(PERSISTED_METADATA_MAX_TOOLS);
  });

  it('keeps tool arguments as objects rather than replacing them with a string', () => {
    const projected = projectPersistedMessageMetadata({
      tools: [{ name: 'web_search', status: 'completed', rawArgs: { query: 'z'.repeat(5_000) } }],
    });
    const tool = (projected?.['tools'] as Record<string, unknown>[])[0];
    expect(typeof tool?.['rawArgs']).toBe('object');
    expect(typeof (tool?.['rawArgs'] as Record<string, unknown>)['query']).toBe('string');
  });

  it('clips reasoning rather than dropping the turn that produced it', () => {
    const projected = projectPersistedMessageMetadata({ thinkingContent: 'a'.repeat(200_000) });
    expect(String(projected?.['thinkingContent'])).toHaveLength(
      PERSISTED_METADATA_MAX_THINKING_CHARS,
    );
  });

  it('never mutates the caller metadata', () => {
    const metadata = { searchResults: [source(1)] };
    const before = JSON.stringify(metadata);
    projectPersistedMessageMetadata(metadata);
    expect(JSON.stringify(metadata)).toBe(before);
  });

  it('stays under the stored cap for every adversarial shape, and says when it dropped a key', () => {
    const cases: Array<Record<string, unknown>> = [
      { searchResults: Array.from({ length: 500 }, (_, i) => source(i, 100_000)) },
      {
        searchResults: {
          query: 'q'.repeat(50_000),
          results: Array.from({ length: 500 }, (_, i) => source(i)),
        },
        citations: Array.from({ length: 500 }, (_, i) => ({
          url: `https://example.com/${i}`,
          title: 'T'.repeat(10_000),
          cited_text: 'C'.repeat(10_000),
        })),
        tools: Array.from({ length: 500 }, (_, i) => ({
          name: `tool-${i}`,
          status: 'completed',
          result: 'r'.repeat(20_000),
          parameters: { nested: { deep: { deeper: { deepest: 'd'.repeat(20_000) } } } },
        })),
        thinkingContent: 'think'.repeat(50_000),
        thinkingSegments: Array.from({ length: 200 }, (_, i) => ({
          id: String(i),
          content: 'seg'.repeat(20_000),
          isStreaming: false,
          startedAt: '2026-09-13T00:00:00.000Z',
          completedAt: null,
        })),
        codeExecutionResult: {
          stdout: 's'.repeat(400_000),
          stderr: 'e'.repeat(400_000),
          returnCode: 0,
        },
        model: 'm'.repeat(10_000),
        provider: 'p'.repeat(10_000),
      },
      { unknownFutureKey: { blob: 'z'.repeat(500_000) }, model: 'a-model' },
      {
        unknownA: 'a'.repeat(100_000),
        unknownB: 'b'.repeat(100_000),
        unknownC: 'c'.repeat(100_000),
      },
      {
        research: { report: 'r'.repeat(300_000) },
        generatedFiles: Array.from({ length: 400 }, () => ({ uri: 'u'.repeat(3_000) })),
      },
    ];

    for (const metadata of cases) {
      const projected = projectPersistedMessageMetadata(metadata);
      expect(managedCloudMetadataLength(projected)).toBeLessThanOrEqual(
        MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
      );
      expect(ManagedCloudMessageMetadataSchema.safeParse(projected).success).toBe(true);
    }

    const dropped = projectPersistedMessageMetadata({
      unknownFutureKey: { blob: 'z'.repeat(500_000) },
    });
    expect(dropped?.[METADATA_TRUNCATED_KEY]).toBe(true);
  });

  it('keeps an attachment descriptor and never stores half of its inline bytes', () => {
    const projected = projectPersistedMessageMetadata({
      attachments: [
        {
          id: 'att-1',
          assetId: 'asset-1',
          type: 'image',
          name: 'chart.png',
          size: 41_233,
          mimeType: 'image/png',
          url: 'https://storage.example/asset-1',
          content: `data:image/png;base64,${'A'.repeat(400_000)}`,
        },
      ],
    });
    const attachments = projected?.['attachments'] as Record<string, unknown>[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      id: 'att-1',
      assetId: 'asset-1',
      name: 'chart.png',
      url: 'https://storage.example/asset-1',
    });
    expect(attachments[0]?.['content']).toBeUndefined();
    expect(projected?.[METADATA_TRUNCATED_KEY]).toBeUndefined();
  });

  it('leaves an ordinary turn untouched and unflagged', () => {
    const metadata = {
      model: 'a-model',
      provider: 'a-provider',
      searchResults: { query: 'fed funds rate', results: [source(1, 200)], timestamp: 'now' },
      citations: [{ type: 'url_citation', url: 'https://example.com/1', title: 'Result 1' }],
      tools: [{ name: 'web_search', status: 'completed', durationMs: 1200 }],
    };
    const projected = projectPersistedMessageMetadata(metadata);
    expect(projected?.[METADATA_TRUNCATED_KEY]).toBeUndefined();
    expect(managedCloudMetadataLength(projected)).toBeLessThan(
      MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
    );
  });
});
