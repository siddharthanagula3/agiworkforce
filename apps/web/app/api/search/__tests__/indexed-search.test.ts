import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn(), scheduleAccess: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/managed-compute-gate', () => ({
  buildWorkspaceAccessGateResponse: mocks.scheduleAccess,
}));
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
  mocks.scheduleAccess.mockReset().mockResolvedValue(null);
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

  it('restricts a Code category search to indexed Code sessions before applying the limit', async () => {
    mocks.query.mockImplementation(async (sql: string, parameters: unknown[]) =>
      sql.includes('from retrieval_chunks c')
        ? INDEX_ROWS.filter(
            (row) => Array.isArray(parameters[2]) && parameters[2].includes(row.source_kind),
          )
        : [],
    );
    const response = await GET(
      new NextRequest('http://localhost/api/search?q=quarterly&category=code&limit=1'),
    );

    expect(response.status).toBe(200);
    expect(indexCall()[1].slice(0, 3)).toEqual(['user-abc', null, ['developer_session']]);
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        /from (web_conversations|web_messages|media_assets|user_projects)/u.test(String(sql)),
      ),
    ).toBe(false);
    const result = (await response.json()) as { documents: Array<{ href: string }> };
    expect(result.documents.map((document) => document.href)).toEqual(['/code/code-1']);
  });

  it('searches schedule names in the active workspace and links to the exact schedule', async () => {
    const scheduleId = '11111111-1111-4111-8111-111111111111';
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes('from scheduled_tasks')
        ? [{ id: scheduleId, name: 'Quarterly report', created_at: null, updated_at: null }]
        : [],
    );
    const response = await GET(
      new NextRequest('http://localhost/api/search?q=quarterly&category=scheduled&limit=1'),
    );
    expect(response.status).toBe(200);
    const { schedules } = (await response.json()) as { schedules: Array<{ href: string }> };
    expect(schedules[0]?.href).toBe(`/chat/schedules?schedule=${scheduleId}`);
    const [sql, params] =
      mocks.query.mock.calls.find(([sql]) => String(sql).includes('from scheduled_tasks')) ?? [];
    expect(sql).toContain('user_id = $1 and organization_id is not distinct from $2::uuid');
    expect(params).toEqual(['user-abc', null, '%quarterly%', null, null, 1]);
    expect(
      mocks.query.mock.calls.some(([sql]) => String(sql).includes('from retrieval_chunks c')),
    ).toBe(false);
  });

  it('honors the schedules workspace denial before a selected category reads schedules', async () => {
    mocks.scheduleAccess.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }));
    const response = await GET(
      new NextRequest('http://localhost/api/search?q=quarterly&category=scheduled'),
    );
    expect(response.status).toBe(403);
    expect(
      mocks.query.mock.calls.some(([sql]) => String(sql).includes('from scheduled_tasks')),
    ).toBe(false);
  });

  it('keeps other results in All while omitting schedules denied by workspace policy', async () => {
    mocks.scheduleAccess.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from scheduled_tasks')) return [{ id: 'schedule-1' }];
      if (sql.includes('from retrieval_chunks c')) return INDEX_ROWS;
      return [];
    });
    const response = await GET(new NextRequest('http://localhost/api/search?q=quarterly'));
    expect(response.status).toBe(200);

    const { schedules, documents } = (await response.json()) as {
      schedules: unknown[];
      documents: unknown[];
    };
    expect(schedules).toEqual([]);
    expect(documents).toHaveLength(INDEX_ROWS.length);
  });

  it.each([['role=user'], ['startDate=2026-01-01'], ['endDate=2026-02-01']])(
    'leaves indexed passages out when %s narrows the message search',
    async (filter) => {
      const response = await GET(
        new NextRequest(`http://localhost/api/search?q=quarterly&${filter}`),
      );
      const body = (await response.json()) as {
        documents: unknown[];
        stats: { documentMatches: number };
      };

      expect(response.status).toBe(200);
      expect(body.documents).toEqual([]);
      expect(body.stats.documentMatches).toBe(0);
      expect(
        (mocks.query.mock.calls as Array<[string]>).some(([sql]) =>
          sql.includes('from retrieval_chunks c'),
        ),
      ).toBe(false);
    },
  );
});
