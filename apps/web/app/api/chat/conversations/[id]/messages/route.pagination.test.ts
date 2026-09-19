import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { decodeKeysetCursor, encodeKeysetCursor } from '@/lib/identity/pagination';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user-1';
const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

const db = {
  query: mocks.query,
  execute: mocks.execute,
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-chat', () => ({ normalizeMessageMetadata: (value: unknown) => value }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db, userId: USER_ID, organizationId: ORGANIZATION_ID })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('./lib/generate-title', () => ({ scheduleConversationTitleGeneration: vi.fn() }));
vi.mock('./lib/index-artifacts', () => ({ scheduleArtifactIndexing: vi.fn() }));

const { GET } = await import('./route');

const context = { params: Promise.resolve({ id: CONVERSATION_ID }) };

function request(query = ''): NextRequest {
  return new NextRequest(
    `https://agiworkforce.com/api/chat/conversations/${CONVERSATION_ID}/messages${query}`,
  );
}

function messageRow(index: number) {
  const createdAt = `2026-09-0${index}T00:00:00.000Z`;
  return {
    id: `55555555-5555-4555-8555-00000000000${index}`,
    parent_id: null,
    role: 'user',
    content: `message ${index}`,
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    created_at: createdAt,
    metadata: {},
    page_sort_key: createdAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReset();
});

describe('GET /api/chat/conversations/[id]/messages', () => {
  it('pages by keyset and hands back a cursor that names the last row', async () => {
    mocks.query
      .mockResolvedValueOnce([{ id: CONVERSATION_ID }])
      .mockResolvedValueOnce([messageRow(1), messageRow(2), messageRow(3)]);

    const response = await GET(request('?limit=2'), context);
    const body = (await response.json()) as {
      messages: Array<{ id: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(response.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(decodeKeysetCursor(body.nextCursor)).toEqual({
      sortValue: '2026-09-02T00:00:00.000Z',
      id: messageRow(2).id,
    });

    const [sql, params] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('order by page_sort_key asc, id asc');
    expect(sql).toContain('deleted_at is null');
    expect(params[1]).toBe(3);
  });

  it('applies the cursor predicate in the same order as the sort', async () => {
    mocks.query
      .mockResolvedValueOnce([{ id: CONVERSATION_ID }])
      .mockResolvedValueOnce([messageRow(3)]);

    const cursor = encodeKeysetCursor({
      sortValue: '2026-09-02T00:00:00.000Z',
      id: messageRow(2).id,
    });
    const response = await GET(request(`?limit=50&cursor=${encodeURIComponent(cursor)}`), context);
    expect(response.status).toBe(200);

    const [sql, params] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('(page_sort_key, id) > ($3, $4)');
    expect(params[2]).toBe('2026-09-02T00:00:00.000Z');
    expect(params[3]).toBe(messageRow(2).id);
  });

  it('answers 404 for a direct link to a deleted conversation', async () => {
    mocks.query.mockResolvedValueOnce([]);

    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('clamps an oversized page request rather than reading the whole conversation', async () => {
    mocks.query.mockResolvedValueOnce([{ id: CONVERSATION_ID }]).mockResolvedValueOnce([]);

    await GET(request('?limit=100000'), context);
    const [, params] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(params[1]).toBe(201);
  });
});
