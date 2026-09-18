import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockRlsQuery, mockResolveSharedProjectScope } = vi.hoisted(() => ({
  mockRlsQuery: vi.fn(),
  mockResolveSharedProjectScope: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockRlsQuery(...args) },
    userId: 'member-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-sharing-service')>()),
  resolveSharedProjectScope: mockResolveSharedProjectScope,
}));

import { decodeKeysetCursor } from '@/lib/identity/pagination';
import { GET as LIST_PROJECTS } from '../route';

function row(index: number): Record<string, unknown> {
  const id = `0000000${index}-0000-4000-8000-000000000000`;
  const sortValue = `2026-01-0${index}T00:00:00.000000Z`;
  return {
    id,
    user_id: 'member-1',
    name: `Project ${index}`,
    description: '',
    instructions: '',
    color: '#3b82f6',
    created_at: sortValue,
    updated_at: sortValue,
    page_sort_key: sortValue,
    conversation_count: 0,
  };
}

function listRequest(query = ''): never {
  return new Request(`http://localhost:3000/api/projects${query}`) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSharedProjectScope.mockResolvedValue(null);
});

describe('GET /api/projects · keyset pagination', () => {
  it('asks for one row beyond the page and drops it from the answer', async () => {
    mockRlsQuery.mockResolvedValue([row(3), row(2), row(1)]);

    const response = await LIST_PROJECTS(listRequest('?limit=2'));
    const body = await response.json();

    expect(mockRlsQuery.mock.calls[0]?.[1]?.[1]).toBe(3);
    expect(body.projects).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(decodeKeysetCursor(body.nextCursor)).toEqual({
      sortValue: '2026-01-02T00:00:00.000000Z',
      id: '00000002-0000-4000-8000-000000000000',
    });
  });

  it('returns no cursor on the last page', async () => {
    mockRlsQuery.mockResolvedValue([row(2), row(1)]);

    const body = await (await LIST_PROJECTS(listRequest('?limit=2'))).json();

    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it('pages from the cursor instead of an offset, tiebreaking on the id', async () => {
    mockRlsQuery.mockResolvedValue([row(1)]);
    const cursor = Buffer.from(
      JSON.stringify(['2026-01-02T00:00:00.000000Z', '00000002-0000-4000-8000-000000000000']),
      'utf8',
    ).toString('base64url');

    await LIST_PROJECTS(listRequest(`?limit=2&cursor=${cursor}`));

    const [sql, params] = mockRlsQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('(page_sort_key, id) < ($6, $7)');
    expect(sql).toContain('order by page_sort_key desc, id desc');
    expect(sql).not.toContain('offset');
    expect(params[5]).toBe('2026-01-02T00:00:00.000000Z');
    expect(params[6]).toBe('00000002-0000-4000-8000-000000000000');
  });

  it('ignores an unreadable cursor rather than failing the read', async () => {
    mockRlsQuery.mockResolvedValue([]);

    const response = await LIST_PROJECTS(listRequest('?cursor=not-a-cursor'));

    expect(response.status).toBe(200);
    const [sql] = mockRlsQuery.mock.calls[0] as [string];
    expect(sql).toContain('offset $3');
  });
});
