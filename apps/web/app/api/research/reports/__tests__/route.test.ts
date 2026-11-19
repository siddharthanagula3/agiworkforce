import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeKeysetCursor } from '@/lib/identity/pagination';

const { mockQuery, mockRateLimit, mockScopedDb } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRateLimit: vi.fn(),
  mockScopedDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockScopedDb }));

const { GET } = await import('../route');

const SHARED_TIME = '2026-08-05T10:00:00.000000Z';

const STORED_ROWS = [
  { id: '0190a000-0000-7000-8000-000000000009', at: '2026-08-06T10:00:00.000000Z' },
  { id: '0190a000-0000-7000-8000-000000000005', at: SHARED_TIME },
  { id: '0190a000-0000-7000-8000-000000000004', at: SHARED_TIME },
  { id: '0190a000-0000-7000-8000-000000000003', at: SHARED_TIME },
  { id: '0190a000-0000-7000-8000-000000000002', at: '2026-08-04T10:00:00.000000Z' },
].map(({ id, at }) => ({
  id,
  user_id: 'user-1',
  request_id: `request-${id}`,
  conversation_id: '0190a000-0000-7000-8000-000000000099',
  query: 'Question',
  title: `Report ${id.slice(-1)}`,
  summary: '',
  content: '',
  citations: [],
  steps: [],
  key_findings: [],
  status: 'completed',
  sources_consulted: 1,
  duration_ms: null,
  error: null,
  model: null,
  provider: null,
  created_at: at.replace(/\.(\d{3})\d{3}Z$/u, '.$1Z'),
  updated_at: at.replace(/\.(\d{3})\d{3}Z$/u, '.$1Z'),
  completed_at: null,
  page_sort_key: at,
}));

function newestFirstKeysetDatabase(
  rows: readonly (typeof STORED_ROWS)[number][],
): (sql: string, params: unknown[]) => Promise<unknown[]> {
  return async (sql, params) => {
    const predicate = /\(created_at, id\) < \(\$(\d+), \$(\d+)\)/u.exec(sql);
    const orderBy = /order by created_at desc, id desc/u.test(sql);
    const limit = params.at(-1) as number;
    const ordered = orderBy
      ? [...rows].sort((left, right) =>
          left.page_sort_key === right.page_sort_key
            ? right.id.localeCompare(left.id)
            : right.page_sort_key.localeCompare(left.page_sort_key),
        )
      : [...rows];
    const after = predicate
      ? ordered.filter((row) => {
          const sortValue = params[Number(predicate[1]) - 1] as string;
          const id = params[Number(predicate[2]) - 1] as string;
          return (
            row.page_sort_key < sortValue || (row.page_sort_key === sortValue && row.id < id)
          );
        })
      : ordered;
    return after.slice(0, limit);
  };
}

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/research/reports${query}`);
}

async function readPage(query: string) {
  const response = await GET(request(query));
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: vi.fn() },
    userId: 'user-1',
    organizationId: null,
  });
  mockQuery.mockImplementation(newestFirstKeysetDatabase(STORED_ROWS));
});

describe('GET /api/research/reports paging', () => {
  it('returns every report exactly once when a page boundary falls inside equal timestamps', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const query: string = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const { status, body } = await readPage(query);
      expect(status).toBe(200);
      seen.push(...body.reports.map((report: { id: string }) => report.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toEqual(STORED_ROWS.map((row) => row.id));
    expect(new Set(seen).size).toBe(STORED_ROWS.length);
  });

  it('hands back a cursor that carries the full timestamp and the id of the last row', async () => {
    const { body } = await readPage('?limit=2');

    expect(body.reports).toHaveLength(2);
    expect(body.nextCursor).toBe(
      encodeKeysetCursor({ sortValue: SHARED_TIME, id: STORED_ROWS[1]!.id }),
    );
  });

  it('ends the listing with no cursor on the last page, including an exact multiple of the page size', async () => {
    const last = await readPage(
      `?limit=3&cursor=${encodeURIComponent(
        encodeKeysetCursor({ sortValue: SHARED_TIME, id: STORED_ROWS[2]!.id }),
      )}`,
    );
    expect(last.body.reports.map((report: { id: string }) => report.id)).toEqual([
      STORED_ROWS[3]!.id,
      STORED_ROWS[4]!.id,
    ]);
    expect(last.body.nextCursor).toBeNull();

    mockQuery.mockImplementation(newestFirstKeysetDatabase(STORED_ROWS.slice(0, 4)));
    const exact = await readPage('?limit=4');
    expect(exact.body.reports).toHaveLength(4);
    expect(exact.body.nextCursor).toBeNull();
  });

  it.each([
    ['not a cursor', 'not-a-cursor'],
    [
      'a cursor with a millisecond timestamp',
      encodeKeysetCursor({ sortValue: '2026-08-05T10:00:00.000Z', id: STORED_ROWS[1]!.id }),
    ],
    [
      'a cursor whose id is not a uuid',
      encodeKeysetCursor({ sortValue: SHARED_TIME, id: 'report-1' }),
    ],
    ['a cursor longer than any the server issues', 'a'.repeat(513)],
  ])('rejects %s instead of serving the first page', async (_label, cursor) => {
    const { status } = await readPage(`?limit=2&cursor=${encodeURIComponent(cursor)}`);

    expect(status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('keeps a conversation listing on the same cursor', async () => {
    const conversationId = '0190a000-0000-7000-8000-000000000099';
    const first = await readPage(`?limit=2&conversationId=${conversationId}`);
    const second = await readPage(
      `?limit=2&conversationId=${conversationId}&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    );

    expect([...first.body.reports, ...second.body.reports].map((r: { id: string }) => r.id)).toEqual(
      STORED_ROWS.slice(0, 4).map((row) => row.id),
    );
    const [sql, params] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('report.conversation_id = $2');
    expect(params.slice(0, 2)).toEqual(['user-1', conversationId]);
  });
});
