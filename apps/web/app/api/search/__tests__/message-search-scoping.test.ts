/**
 * Message search used to materialize the caller's entire conversation-ID list
 * and bind it back as a uuid[] (~180 KB of parameters at 5,000 conversations)
 * for a restriction the conversation join already applies. It also filtered on
 * an unqualified `created_at`, which is ambiguous across the two joined tables,
 * so any date-filtered search was rejected by Postgres before it ran.
 *
 * Both are pinned here because both are invisible in the response shape: the
 * query still returns the right rows, it just costs the extra round trip — or,
 * with a date filter, never returns at all.
 *
 * The message-tombstone filter is pinned for the opposite reason: it IS visible
 * in the response, as soft-deleted message bodies the user asked to delete.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetClerkAuthUser, mockNeonQuery, mockResolveActiveOrganizationId } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockResolveActiveOrganizationId: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
  getAuthenticatedUserWithClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mockResolveActiveOrganizationId,
}));

import { GET } from '@/app/api/search/route';

type QueryCall = [string, unknown[]];

function searchRequest(params = ''): NextRequest {
  return new NextRequest(`http://localhost/api/search?q=hello${params}`, { method: 'GET' });
}

function messageQuery(): QueryCall {
  const call = (mockNeonQuery.mock.calls as QueryCall[]).find(([sql]) =>
    sql.includes('from web_messages'),
  );
  expect(call, 'no web_messages query was issued').toBeDefined();
  return call!;
}

beforeEach(() => {
  // vitest.config.ts sets mockReset: true — re-register per test.
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mockResolveActiveOrganizationId.mockResolvedValue('11111111-1111-4111-8111-111111111111');
  mockNeonQuery.mockResolvedValue([]);
});

describe('GET /api/search message scoping', () => {
  it('scopes messages through the conversation join, with no conversation-ID prefetch', async () => {
    const res = await GET(searchRequest());
    expect(res.status).toBe(200);

    const [sql, params] = messageQuery();
    expect(sql).toContain('join web_conversations c on c.id = m.conversation_id');
    expect(sql).toContain('c.user_id = $1');
    expect(sql).toContain('c.organization_id is not distinct from $3::uuid');
    expect(sql).not.toContain('any($1::uuid[])');
    expect(params[0]).toBe('user-abc');
    expect(params[2]).toBe('11111111-1111-4111-8111-111111111111');

    // The id-list prefetch was the only reader of a bare conversation-id select.
    const prefetch = (mockNeonQuery.mock.calls as QueryCall[]).filter(([statement]) =>
      /^\s*select id from web_conversations/.test(statement),
    );
    expect(prefetch).toEqual([]);
  });

  it('excludes soft-deleted conversations and messages unless includeArchived is set', async () => {
    await GET(searchRequest());
    const [defaultSql] = messageQuery();
    expect(defaultSql).toContain('c.deleted_at is null');
    // /api/chat/sync tombstones a message by setting deleted_at and keeping its
    // content, so without this clause deleted message bodies stay searchable.
    expect(defaultSql).toContain('m.deleted_at is null');

    mockNeonQuery.mockClear();
    await GET(searchRequest('&includeArchived=true'));
    const [archivedSql] = messageQuery();
    expect(archivedSql).not.toContain('c.deleted_at is null');
    expect(archivedSql).not.toContain('m.deleted_at is null');
  });

  it('qualifies the date filters so they are not ambiguous across the join', async () => {
    await GET(searchRequest('&startDate=2026-01-01&endDate=2026-02-01&role=user'));

    const [sql, params] = messageQuery();
    expect(sql).toContain('m.role = $4');
    expect(sql).toContain('m.created_at >= $5');
    expect(sql).toContain('m.created_at <= $6');
    expect(sql).not.toMatch(/\band created_at\b/);
    expect(params).toEqual([
      'user-abc',
      '%hello%',
      '11111111-1111-4111-8111-111111111111',
      'user',
      '2026-01-01',
      '2026-02-01',
    ]);
  });

  it('scopes every searchable content root to Personal when no workspace is active', async () => {
    mockResolveActiveOrganizationId.mockResolvedValueOnce(null);

    await GET(searchRequest());

    const contentCalls = (mockNeonQuery.mock.calls as QueryCall[]).filter(([sql]) =>
      /from (web_conversations|user_projects|media_assets|web_messages)/.test(sql),
    );
    expect(contentCalls).toHaveLength(4);
    for (const [sql, params] of contentCalls) {
      expect(sql).toContain('organization_id is not distinct from $3::uuid');
      expect(params[2]).toBeNull();
    }
  });

  it('returns message hits without depending on a prior conversation listing', async () => {
    // The database decides what matches; the route no longer gates the message
    // query behind the result of a separate query it also has to pay for.
    mockNeonQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('from web_messages')
          ? [
              {
                id: 'm1',
                conversation_id: 'c1',
                role: 'assistant',
                content: 'hello there',
                created_at: '2026-01-02T00:00:00Z',
                updated_at: '2026-01-02T00:00:00Z',
                session_title: 'Greeting',
              },
            ]
          : [],
      ),
    );

    const res = await GET(searchRequest());
    const body = (await res.json()) as { stats: { messageMatches: number } };
    expect(body.stats.messageMatches).toBe(1);
  });

  it('attributes full-search telemetry to the workspace captured for the request', async () => {
    await GET(searchRequest());

    expect(mockNeonQuery).toHaveBeenCalledWith('select track_search($1, $2, $3, $4)', [
      'user-abc',
      '11111111-1111-4111-8111-111111111111',
      'hello',
      0,
    ]);
  });
});
