/**
 * POST /api/memory/sync — delta-push semantics + back-compat trigger.
 *
 * Guards:
 *  - push UPSERTs by id with last-writer-wins (excluded.updated_at >= existing),
 *  - user_id is forced server-side (RLS WITH CHECK backstop) — never from the body,
 *  - is_deleted carries the tombstone so deletes propagate,
 *  - a no-`memories` body still returns the legacy { synced, conflicts } shape,
 *  - GET without `since` returns the legacy status shape (back-compat for mobile).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: { query: queryMock }, userId: 'u1' })),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => undefined) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => undefined) }));

import { GET, POST } from '@/app/api/memory/sync/route';
import { NextRequest } from 'next/server';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([{ id: 'x', server_version: '7' }]);
});

function postReq(body: unknown | undefined) {
  return new NextRequest('http://localhost/api/memory/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST /api/memory/sync — delta push', () => {
  it('UPSERTs memories by id with last-writer-wins and forces user_id server-side', async () => {
    const res = await POST(
      postReq({
        memories: [
          {
            id: '0190a000-0000-7000-8000-000000000abc',
            content: 'User prefers terse answers',
            category: 'preference',
            source: 'mobile',
            updatedAt: '2026-06-22T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toEqual([{ id: 'x', server_version: '7' }]);
    expect(body.cursor).toBe('7');

    const call = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into user_memories'),
    );
    expect(call).toBeDefined();
    const sql = String(call![0]);
    // LWW guard: only apply when the pushed row is at least as new.
    expect(sql).toContain('excluded.updated_at >= user_memories.updated_at');
    // user_id ownership guard in the UPDATE branch.
    expect(sql).toContain('user_memories.user_id = $2');
    // tombstone propagates.
    expect(sql).toContain('is_deleted = excluded.is_deleted');
    // user_id param is the SESSION user, never from the body.
    const params = call![1] as unknown[];
    expect(params[1]).toBe('u1');
  });

  it('falls back to the legacy { synced, conflicts } trigger when no memories are sent', async () => {
    queryMock.mockResolvedValueOnce([{ count: 3 }]);
    const res = await POST(postReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ synced: 3, conflicts: 0 });
    // It must NOT have run an insert.
    const insertCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into user_memories'),
    );
    expect(insertCall).toBeUndefined();
  });
});

describe('GET /api/memory/sync — back-compat status', () => {
  it('returns the legacy status shape when no `since` cursor is provided', async () => {
    queryMock.mockResolvedValueOnce([
      { source: 'web', updated_at: '2026-06-22T00:00:00.000Z' },
      { source: 'mobile', updated_at: '2026-06-21T00:00:00.000Z' },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/memory/sync'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entriesCount).toBe(2);
    expect(body.sources.web).toBe(1);
    expect(body.sources.mobile).toBe(1);
    expect(body.lastSync).toBe('2026-06-22T00:00:00.000Z');
  });

  it('returns a delta page (not status) when `since` is present', async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: '0190a000-0000-7000-8000-000000000abc',
        content: 'hi',
        category: null,
        source: 'web',
        is_deleted: false,
        created_at: '2026-06-22T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
        server_version: '12',
      },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/memory/sync?since=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cursor).toBe('12');
    expect(body.hasMore).toBe(false);
    expect(body.memories).toHaveLength(1);
    // The pull query must NOT filter is_deleted (tombstones must propagate).
    const call = queryMock.mock.calls.find((c) => String(c[0]).includes('from user_memories'));
    expect(String(call![0])).not.toContain('is_deleted = false');
  });
});
