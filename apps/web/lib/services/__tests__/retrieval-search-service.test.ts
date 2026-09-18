import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  RETRIEVAL_EMBEDDING_DIMENSIONS,
  SearchResidencyError,
  type SearchHit,
} from '@agiworkforce/data-layer/search';

const mocks = vi.hoisted(() => ({ embed: vi.fn(), readRegion: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/data-region', () => ({ readOrganizationRegion: mocks.readRegion }));
vi.mock('@/lib/services/retrieval-embedding-service', async () => {
  class RetrievalEmbeddingError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  }
  return { embedTextsMetered: mocks.embed, RetrievalEmbeddingError };
});

const { buildTsQuery, createPostgresSearchProvider } = await import('../retrieval-search-service');
const { RetrievalEmbeddingError } = await import('@/lib/services/retrieval-embedding-service');
const { toSearchDocumentResults } = await import('../retrieval-search-results');
const { passagesFromIndexedHits } = await import('../project-knowledge-retrieval');

const ROWS = [
  {
    chunk_id: 'chunk-a',
    document_id: 'doc-a',
    source_kind: 'artifact',
    source_id: 'art-1',
    title: 'Pricing table',
    content: 'Enterprise pricing starts at a seat minimum.',
    start_offset: 0,
    end_offset: 44,
    metadata: { conversationId: 'conv-1' },
    chunk_version: 1,
    indexed_at: '2026-09-17 00:00:00+00',
    lexical_rank: '1',
    semantic_rank: '2',
  },
  {
    chunk_id: 'chunk-b',
    document_id: 'doc-b',
    source_kind: 'developer_session',
    source_id: 'code-1',
    title: 'Fix login',
    content: 'Session cookie refresh fix.',
    start_offset: 0,
    end_offset: 27,
    metadata: {},
    chunk_version: 1,
    indexed_at: null,
    lexical_rank: null,
    semantic_rank: '1',
  },
];

function scopedDb(options: { embeddingsPresent: boolean }) {
  const query = vi.fn(async (sql: string, _params?: unknown[]): Promise<unknown[]> => {
    if (sql.includes('as present')) return [{ present: options.embeddingsPresent }];
    return ROWS;
  });
  const adapter = {
    query,
    execute: vi.fn(async () => 1),
    transaction: vi.fn(),
    withUser: vi.fn(),
    withOrg: vi.fn(),
    dispose: vi.fn(),
  };
  return { query, adapter: adapter as unknown as DatabaseAdapter };
}

beforeEach(() => {
  mocks.embed.mockReset();
  mocks.readRegion.mockReset();
  mocks.readRegion.mockResolvedValue({
    effective: 'us',
    requested: null,
    requestedAt: null,
    provisioned: true,
    missing: [],
  });
});

describe('buildTsQuery', () => {
  it('requires every term and completes the last one as a prefix for typed search', () => {
    expect(buildTsQuery('Enterprise pric', 'all_terms')).toBe('enterprise & pric:*');
  });

  it('accepts any term for a natural-language question', () => {
    expect(buildTsQuery("what's our refund window?", 'any_term')).toBe(
      'what | s | our | refund | window',
    );
  });

  it('strips every tsquery operator a user could type', () => {
    expect(buildTsQuery("a & b | !c <-> (d):*'", 'all_terms')).toBe('a & b & c & d:*');
    expect(buildTsQuery('&|!', 'all_terms')).toBeNull();
  });
});

describe('createPostgresSearchProvider', () => {
  it('fuses lexical and semantic candidates inside the caller scope', async () => {
    mocks.embed.mockResolvedValue({
      vectors: [Array.from({ length: RETRIEVAL_EMBEDDING_DIMENSIONS }, () => 0.5)],
      model: 'embedding-model',
      routeId: 'route',
    });
    const { query, adapter } = scopedDb({ embeddingsPresent: true });

    const response = await createPostgresSearchProvider({
      db: adapter,
      userId: 'user-1',
      organizationId: 'org-1',
      semantic: true,
    }).search({ text: 'enterprise pricing', limit: 10, match: 'all_terms' });

    expect(response.semantic).toBe('used');
    expect(response.hits.map((hit) => hit.chunkId)).toEqual(['chunk-a', 'chunk-b']);
    const [sql, params] = query.mock.calls.at(-1) as unknown as [string, unknown[]];
    expect(sql).toContain('lexical as (');
    expect(sql).toContain('semantic as (');
    expect(sql).toContain("to_tsquery('simple', $6)");
    expect(sql).toContain('$7::vector');
    expect(params.slice(0, 2)).toEqual(['user-1', 'org-1']);
    expect(params[5]).toBe('enterprise & pricing:*');
    expect(String(params[6]).startsWith('[0.5,')).toBe(true);
  });

  it('ranks by full text alone when the query embedding is refused', async () => {
    mocks.embed.mockRejectedValue(new RetrievalEmbeddingError('no credits', 'billing_refused'));
    const { query, adapter } = scopedDb({ embeddingsPresent: true });

    const response = await createPostgresSearchProvider({
      db: adapter,
      userId: 'user-1',
      organizationId: null,
      semantic: true,
    }).search({ text: 'pricing', limit: 5 });

    expect(response.semantic).toBe('unavailable');
    const [sql, params] = query.mock.calls.at(-1) as unknown as [string, unknown[]];
    expect(sql).not.toContain('semantic as (');
    expect(params).toHaveLength(6);
  });

  it('never pays for a query embedding when nothing in scope is embedded', async () => {
    const { adapter } = scopedDb({ embeddingsPresent: false });

    const response = await createPostgresSearchProvider({
      db: adapter,
      userId: 'user-1',
      organizationId: null,
      semantic: true,
    }).search({ text: 'pricing', limit: 5 });

    expect(response.semantic).toBe('no_index');
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it('refuses a workspace pinned to a region this deployment cannot serve', async () => {
    mocks.readRegion.mockResolvedValue({
      effective: 'eu',
      requested: null,
      requestedAt: null,
      provisioned: false,
      missing: ['AGI_DATA_REGION_EU_DATABASE_URL'],
    });
    const { query, adapter } = scopedDb({ embeddingsPresent: true });

    const refusal = await createPostgresSearchProvider({
      db: adapter,
      userId: 'user-1',
      organizationId: 'org-eu',
      semantic: true,
    })
      .search({ text: 'pricing', limit: 5 })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(SearchResidencyError);
    expect((refusal as SearchResidencyError).refusal).toBe('region_not_provisioned');
    expect(query).not.toHaveBeenCalled();
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it('refuses a cross-region query instead of answering from the home region', async () => {
    mocks.readRegion.mockResolvedValue({
      effective: 'eu',
      requested: null,
      requestedAt: null,
      provisioned: true,
      missing: [],
    });
    const { query, adapter } = scopedDb({ embeddingsPresent: true });

    const refusal = await createPostgresSearchProvider({
      db: adapter,
      userId: 'user-1',
      organizationId: 'org-eu',
      semantic: true,
    })
      .search({ text: 'pricing', limit: 5 })
      .catch((error: unknown) => error);

    expect((refusal as SearchResidencyError).refusal).toBe('cross_region');
    expect(query).not.toHaveBeenCalled();
  });

  it('reads the region once when the caller already resolved it', async () => {
    const { adapter } = scopedDb({ embeddingsPresent: false });

    await createPostgresSearchProvider({
      db: adapter,
      userId: 'user-1',
      organizationId: 'org-1',
      semantic: true,
      residency: { origin: 'us', executing: 'us', provisioned: true, missing: [] },
    }).search({ text: 'pricing', limit: 5 });

    expect(mocks.readRegion).not.toHaveBeenCalled();
  });

  it('runs no embedding and no vector clause for a keyword-only strategy', async () => {
    const { query, adapter } = scopedDb({ embeddingsPresent: true });

    const response = await createPostgresSearchProvider({
      db: adapter,
      userId: 'user-1',
      organizationId: null,
      semantic: true,
    }).search({ text: 'pricing', limit: 5, strategy: 'keyword' });

    expect(response.semantic).toBe('unavailable');
    expect(mocks.embed).not.toHaveBeenCalled();
    const [sql] = query.mock.calls.at(-1) as unknown as [string];
    expect(sql).toContain('lexical as (');
    expect(sql).not.toContain('semantic as (');
  });

  it('refuses a mode the private index does not serve', async () => {
    const { adapter } = scopedDb({ embeddingsPresent: false });

    await expect(
      createPostgresSearchProvider({
        db: adapter,
        userId: 'user-1',
        organizationId: null,
        semantic: true,
      }).search({ text: 'pricing', limit: 5, mode: 'web' }),
    ).rejects.toThrow(/public_web/);
  });

  it('returns nothing rather than failing before the index migration is applied', async () => {
    const { query, adapter } = scopedDb({ embeddingsPresent: false });
    query.mockRejectedValue(Object.assign(new Error('missing'), { code: '42P01' }));

    const response = await createPostgresSearchProvider({
      db: adapter,
      userId: 'user-1',
      organizationId: null,
      semantic: true,
    }).search({ text: 'pricing', limit: 5 });

    expect(response.hits).toEqual([]);
  });
});

function hit(overrides: Partial<SearchHit>): SearchHit {
  return {
    chunkId: 'c',
    documentId: 'd',
    sourceKind: 'conversation',
    sourceId: 'conv-1',
    title: 'Chat',
    text: 'The refund window is thirty days from delivery.',
    start: 0,
    end: 48,
    metadata: {},
    chunkVersion: 1,
    indexedAt: null,
    lexicalRank: 1,
    semanticRank: null,
    score: 1,
    matchedTerms: ['refund'],
    ...overrides,
  };
}

describe('toSearchDocumentResults', () => {
  it('links each source to where it opens and keeps one result per source', () => {
    const results = toSearchDocumentResults([
      hit({ metadata: { messageId: 'msg-1' } }),
      hit({ chunkId: 'c2' }),
      hit({ sourceKind: 'developer_session', sourceId: 'code-1' }),
      hit({
        sourceKind: 'research_report',
        sourceId: 'rep-1',
        metadata: { conversationId: 'c-9' },
      }),
      hit({ sourceKind: 'project_knowledge', sourceId: 'file-1', metadata: { projectId: 'p-1' } }),
    ]);
    expect(results.map((result) => result.href)).toEqual([
      '/chat/conv-1?highlightMessage=msg-1',
      '/code/code-1',
      '/chat/c-9',
      '/chat/projects/p-1',
    ]);
  });
});

describe('passagesFromIndexedHits', () => {
  const content = 'alpha section. '.repeat(40) + 'The refund window is thirty days.';

  it('uses hits whose offsets still match the stored text and merges overlaps', () => {
    const start = content.indexOf('The refund');
    const selection = passagesFromIndexedHits({
      content,
      leadingTrimmed: 0,
      hits: [
        hit({ start, end: content.length, text: content.slice(start) }),
        hit({ start: start - 20, end: start + 10, text: content.slice(start - 20, start + 10) }),
        hit({ start: 0, end: 10, text: 'stale text' }),
      ],
      budgetChars: 500,
    });
    expect(selection?.strategy).toBe('passages');
    expect(selection?.passages).toEqual([
      { start: start - 20, end: content.length, text: content.slice(start - 20) },
    ]);
  });

  it('returns null when every hit is stale so per-request selection takes over', () => {
    expect(
      passagesFromIndexedHits({
        content,
        leadingTrimmed: 0,
        hits: [hit({ start: 0, end: 5, text: 'other' })],
        budgetChars: 500,
      }),
    ).toBeNull();
  });
});
