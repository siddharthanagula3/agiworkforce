import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-abc',
    organizationId: null,
  })),
}));

import { GET } from '@/app/api/search/route';

const INDEX_ROWS = [
  {
    chunk_id: 'chunk-1',
    document_id: 'doc-1',
    source_kind: 'artifact',
    source_id: 'art-1',
    title: 'Quarterly plan',
    content: 'The quarterly plan covers hiring and runway.',
    start_offset: 0,
    end_offset: 44,
    metadata: { conversationId: 'conv-1' },
    chunk_version: 1,
    indexed_at: null,
    lexical_rank: '1',
    semantic_rank: null,
  },
  {
    chunk_id: 'chunk-2',
    document_id: 'doc-2',
    source_kind: 'research_report',
    source_id: 'rep-1',
    title: 'Runway research',
    content: 'Quarterly burn and runway benchmarks for seed companies.',
    start_offset: 0,
    end_offset: 57,
    metadata: {},
    chunk_version: 1,
    indexed_at: null,
    lexical_rank: '2',
    semantic_rank: null,
  },
  {
    chunk_id: 'chunk-3',
    document_id: 'doc-3',
    source_kind: 'developer_session',
    source_id: 'code-1',
    title: 'Quarterly export job',
    content: 'Added the quarterly export cron.',
    start_offset: 0,
    end_offset: 31,
    metadata: {},
    chunk_version: 1,
    indexed_at: null,
    lexical_rank: '3',
    semantic_rank: null,
  },
];

function indexCall(): [string, unknown[]] {
  const call = (mocks.query.mock.calls as Array<[string, unknown[]]>).find(([sql]) =>
    sql.includes('from retrieval_chunks c'),
  );
  expect(call, 'the index was not queried').toBeDefined();
  return call!;
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes('from retrieval_chunks c') ? INDEX_ROWS : [],
  );
});

describe('GET /api/search over the retrieval index', () => {
  it('returns artifacts, research reports and developer sessions with their links', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=quarterly'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      documents: Array<{ type: string; href: string }>;
      stats: { documentMatches: number };
      semantic: string;
    };

    expect(
      body.documents
        .map((document) => [document.type, document.href])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ).toEqual([
      ['artifact', '/chat/conv-1'],
      ['developer_session', '/code/code-1'],
      ['research_report', '/chat'],
    ]);
    expect(body.stats.documentMatches).toBe(3);
    expect(body.semantic).toBe('unavailable');
  });

  it('scopes the index query to the caller, workspace and requested kinds', async () => {
    await GET(
      new NextRequest(
        'http://localhost/api/search?q=quarterly%20plan&kind=artifact&kind=bogus&mode=lexical',
      ),
    );

    const [sql, params] = indexCall();
    expect(sql).toContain('c.user_id = $1');
    expect(sql).toContain('c.organization_id is not distinct from $2::uuid');
    expect(params.slice(0, 3)).toEqual(['user-abc', null, ['artifact']]);
    expect(params[5]).toBe('quarterly & plan:*');
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('as present'))).toBe(false);
  });
});
