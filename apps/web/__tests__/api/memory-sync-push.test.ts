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
  queryMock.mockResolvedValue([
    {
      kind: 'applied',
      id: '0190a000-0000-7000-8000-000000000abc',
      server_version: '7',
      current: null,
    },
  ]);
});

function postReq(body: unknown | undefined) {
  return new NextRequest('http://localhost/api/memory/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST /api/memory/sync, delta push', () => {
  it('compare-and-swaps memories by server revision and forces user_id server-side', async () => {
    const res = await POST(
      postReq({
        protocolVersion: 2,
        memories: [
          {
            id: '0190a000-0000-7000-8000-000000000abc',
            content: 'User prefers terse answers',
            category: 'preference',
            source: 'mobile',
            baseVersion: '6',
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocolVersion).toBe(2);
    expect(body.applied).toEqual([
      { id: '0190a000-0000-7000-8000-000000000abc', server_version: '7' },
    ]);
    expect(body.conflicts).toEqual([]);
    expect(body.cursor).toBe('7');

    const call = queryMock.mock.calls.find((c) => String(c[0]).includes('update user_memories'));
    expect(call).toBeDefined();
    const sql = String(call![0]);
    expect(sql).toContain('existing.server_version = incoming.base_version');
    expect(sql).toContain('updated_at = now()');
    expect(sql).not.toContain('excluded.updated_at');
    const params = call![1] as unknown[];
    expect(params[0]).toBe('u1');
  });

  it('falls back to the legacy { synced, conflicts } trigger when no memories are sent', async () => {
    queryMock.mockResolvedValueOnce([{ count: 3 }]);
    const res = await POST(postReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ synced: 3, conflicts: 0 });
    const insertCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into user_memories'),
    );
    expect(insertCall).toBeUndefined();
  });
});

describe('GET /api/memory/sync, back-compat status', () => {
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
    const call = queryMock.mock.calls.find((c) => String(c[0]).includes('from user_memories'));
    expect(String(call![0])).not.toContain('is_deleted = false');
  });
});
