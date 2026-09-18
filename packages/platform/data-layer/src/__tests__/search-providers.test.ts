import { describe, expect, it } from 'vitest';

import {
  createProviderRegistry,
  hybridRerankProvider,
  HYBRID_RERANK_PROVIDER_ID,
  rerankCandidates,
  type RerankProvider,
  type SearchCandidate,
  type SearchResponse,
  type SearchStorageProvider,
} from '../search';

function candidate(overrides: Partial<SearchCandidate> = {}): SearchCandidate {
  return {
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    sourceKind: 'library_file',
    sourceId: 'file-1',
    title: 'Quarterly report',
    text: 'revenue grew in the quarter',
    start: 0,
    end: 27,
    metadata: {},
    chunkVersion: 1,
    indexedAt: '2026-09-17T00:00:00.000Z',
    lexicalRank: 1,
    semanticRank: 1,
    ...overrides,
  };
}

const EMPTY_RESPONSE: SearchResponse = { hits: [], semantic: 'unavailable' };

describe('RerankProvider', () => {
  it('registers the current reranker as a named, replaceable provider', () => {
    const registry = createProviderRegistry<RerankProvider>([hybridRerankProvider]);
    expect(registry.ids()).toEqual([HYBRID_RERANK_PROVIDER_ID]);
    const resolved = registry.get(HYBRID_RERANK_PROVIDER_ID)!;
    expect(resolved.rerank('revenue', [candidate()], { limit: 5 })).toEqual(
      rerankCandidates('revenue', [candidate()], { limit: 5 }),
    );
  });

  it('accepts a different implementation under a different id', () => {
    const passthrough: RerankProvider = {
      id: 'passthrough',
      rerank: (_query, candidates) => candidates.map((c) => ({ ...c, score: 1, matchedTerms: [] })),
    };
    const registry = createProviderRegistry<RerankProvider>([hybridRerankProvider]);
    registry.register(passthrough);
    expect(registry.ids()).toEqual([HYBRID_RERANK_PROVIDER_ID, 'passthrough']);
    expect(
      registry.get('passthrough')!.rerank('revenue', [candidate()], { limit: 5 }),
    ).toHaveLength(1);
  });
});

describe('SearchStorageProvider', () => {
  it('is a named SearchProvider, so the index behind a search is swappable', async () => {
    const storage: SearchStorageProvider = {
      id: 'postgres',
      search: async () => EMPTY_RESPONSE,
    };
    const registry = createProviderRegistry<SearchStorageProvider>([storage]);
    expect(registry.get('postgres')).toBe(storage);
    await expect(registry.get('postgres')!.search({ text: 'a', limit: 1 })).resolves.toEqual(
      EMPTY_RESPONSE,
    );
  });
});

describe('createProviderRegistry', () => {
  it('replaces an id in place rather than answering to it twice', () => {
    const first: SearchStorageProvider = { id: 'index', search: async () => EMPTY_RESPONSE };
    const second: SearchStorageProvider = { id: 'index', search: async () => EMPTY_RESPONSE };
    const registry = createProviderRegistry<SearchStorageProvider>([first]);
    registry.register(second);
    expect(registry.list()).toEqual([second]);
  });

  it('keeps registration order, which is the order a fallback chain tries', () => {
    const registry = createProviderRegistry<SearchStorageProvider>();
    for (const id of ['primary', 'secondary', 'tertiary']) {
      registry.register({ id, search: async () => EMPTY_RESPONSE });
    }
    expect(registry.ids()).toEqual(['primary', 'secondary', 'tertiary']);
  });
});
