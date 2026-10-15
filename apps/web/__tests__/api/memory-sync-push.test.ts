import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: { query: queryMock }, userId: 'u1' })),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => undefined) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => undefined) }));

import { GET, POST } from '@/app/api/memory/sync/route';
import { NextRequest } from 'next/server';
import { answerMemoryPolicyQuery } from '@/lib/services/__tests__/memory-policy-stub';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(
    async (sql: unknown) =>
      answerMemoryPolicyQuery(sql) ?? [
        {
          kind: 'applied',
          id: '0190a000-0000-7000-8000-000000000abc',
          server_version: '7',
          current: null,
        },
      ],
  );
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

  it("scopes the insert conflict target to the owner, so one account cannot squat another's row id", async () => {
    await POST(
      postReq({
        protocolVersion: 2,
        memories: [
          {
            id: '0190a000-0000-7000-8000-000000000abc',
            content: 'User prefers terse answers',
            source: 'mobile',
            baseVersion: '0',
          },
        ],
      }),
    );

    const call = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into user_memories'),
    );
    const sql = String(call![0]);
    expect(sql).toContain('on conflict (user_id, id) do nothing');
    expect(sql).not.toContain('on conflict (id) do nothing');
  });

  it('admits a sensitive fact a device user wrote and refuses one a device learned by itself', async () => {
    const written = '0190a000-0000-7000-8000-000000000abc';
    const learned = '0190a000-0000-7000-8000-000000000abd';

    const res = await POST(
      postReq({
        protocolVersion: 2,
        memories: [
          {
            id: written,
            content: 'User is a practicing Catholic',
            source: 'mobile',
            baseVersion: '0',
          },
          { id: learned, content: 'User has type 2 diabetes', source: 'auto', baseVersion: '0' },
        ],
      }),
    );

    const body = await res.json();
    expect(body.rejected).toEqual([
      expect.objectContaining({ id: learned, reason: 'sensitive_topic_not_opted_in' }),
    ]);
    const call = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into user_memories'),
    );
    const admitted = JSON.parse(String((call![1] as unknown[])[1])) as Array<{ id: string }>;
    expect(admitted.map((memory) => memory.id)).toEqual([written]);
  });

  it('admits a sensitive fact the CLI adds with agi memory add', async () => {
    const added = '0190a000-0000-7000-8000-000000000abe';

    const res = await POST(
      postReq({
        protocolVersion: 2,
        memories: [
          {
            id: added,
            content: 'User is a practicing Catholic',
            source: 'cli',
            baseVersion: '0',
          },
        ],
      }),
    );

    const body = await res.json();
    expect(body.rejected ?? []).toEqual([]);
    const call = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into user_memories'),
    );
    const admitted = JSON.parse(String((call![1] as unknown[])[1])) as Array<{ id: string }>;
    expect(admitted.map((memory) => memory.id)).toEqual([added]);
  });

  function storedRows(rows: Array<{ id: string; content: string }>) {
    queryMock.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('id = any($2::uuid[])')) return rows;
      return (
        answerMemoryPolicyQuery(sql) ?? [
          { kind: 'applied', id: rows[0]?.id, server_version: '50', current: null },
        ]
      );
    });
  }

  function admittedIds(): string[] {
    const call = queryMock.mock.calls.find((c) => String(c[0]).includes('update user_memories'));
    return (JSON.parse(String((call![1] as unknown[])[1])) as Array<{ id: string }>).map(
      (memory) => memory.id,
    );
  }

  it('applies a pin of a stored memory as the user acting on it, whatever the memory says', async () => {
    const learned = '0190a000-0000-7000-8000-000000000b01';
    const older = '0190a000-0000-7000-8000-000000000b02';
    storedRows([
      { id: learned, content: 'User has ADHD' },
      { id: older, content: 'User was arrested in 2019' },
    ]);

    const res = await POST(
      postReq({
        protocolVersion: 2,
        memories: [
          {
            id: learned,
            content: 'User has ADHD',
            source: 'auto',
            pinned: true,
            baseVersion: '42',
          },
          {
            id: older,
            content: 'User was arrested in 2019',
            source: 'auto',
            pinned: true,
            baseVersion: '17',
          },
        ],
      }),
    );

    expect((await res.json()).rejected).toEqual([]);
    expect(admittedIds()).toEqual([learned, older]);
  });

  it("admits the user's edit of a learned memory as their own words, and still refuses never-stored content", async () => {
    const edited = '0190a000-0000-7000-8000-000000000b03';
    const leaked = '0190a000-0000-7000-8000-000000000b04';
    storedRows([
      { id: edited, content: 'User has ADHD' },
      { id: leaked, content: 'User likes tea' },
    ]);

    const res = await POST(
      postReq({
        protocolVersion: 2,
        memories: [
          {
            id: edited,
            content: 'User has ADHD and takes Adderall',
            source: 'auto',
            baseVersion: '42',
          },
          { id: leaked, content: 'User SSN is 123-45-6789', source: 'auto', baseVersion: '43' },
        ],
      }),
    );

    expect((await res.json()).rejected).toEqual([
      expect.objectContaining({ id: leaked, reason: 'prohibited_content_category' }),
    ]);
    expect(admittedIds()).toEqual([edited]);
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
    const [, whereClause] = String(call![0]).split(/\bwhere\b/);
    expect(whereClause).not.toContain('is_deleted = false');
    expect(whereClause).toContain('organization_id is not distinct from $3::uuid');
    expect(String(call![0])).toContain('not (m.is_deleted = false and m.superseded_by is null');
  });
});
