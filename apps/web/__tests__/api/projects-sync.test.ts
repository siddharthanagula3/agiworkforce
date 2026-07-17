/**
 * /api/projects/sync — delta-sync cursor + push semantics + tombstone propagation.
 *
 * Guards:
 *  - cursor advances to the highest delivered server_version (bigint, not lexicographic),
 *  - push compare-and-swaps by the server-owned revision (client clocks never win),
 *  - user_id is forced server-side (RLS WITH CHECK backstop) — never from the body,
 *  - deleted_at carries the tombstone so deletes propagate cross-device,
 *  - the pull query does NOT filter deleted_at (tombstones must be delivered),
 *  - local-only routing hints (default_privacy_mode/provider_mode) are NOT in the wire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock, getSubscriptionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getSubscriptionMock: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: { query: queryMock }, userId: 'u1' })),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => undefined) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => undefined) }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: getSubscriptionMock },
}));

import { GET, POST, computeProjectsPullCursor } from '@/app/api/projects/sync/route';
import { NextRequest } from 'next/server';

const sv = (n: number) => ({ server_version: String(n) });

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([{ kind: 'applied', id: 'x', server_version: '4', current: null }]);
  getSubscriptionMock.mockReset();
  getSubscriptionMock.mockResolvedValue({ plan_tier: 'free' });
});

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/projects/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('computeProjectsPullCursor', () => {
  it('advances to the highest delivered version (rows ordered asc)', () => {
    expect(computeProjectsPullCursor('0', [sv(2), sv(40)])).toBe('40');
  });
  it('no progress on an empty page', () => {
    expect(computeProjectsPullCursor('9', [])).toBe('9');
  });
  it('compares frontier vs since as bigint (digit-length boundary)', () => {
    expect(computeProjectsPullCursor('9', [sv(100)])).toBe('100');
  });
});

describe('POST /api/projects/sync — push', () => {
  it('compare-and-swaps by server revision, forces user_id, carries the tombstone', async () => {
    const res = await POST(
      postReq({
        projects: [
          {
            id: '0190a000-0000-7000-8000-0000000000d1',
            name: 'Launch plan',
            instructions: 'Be concise.',
            baseVersion: '0',
            updatedAt: '2026-06-22T00:00:00.000Z',
            deletedAt: null,
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toEqual([{ id: 'x', server_version: '4' }]);

    const call = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into user_projects'),
    );
    expect(call).toBeDefined();
    const sql = String(call![0]);
    expect(sql).toContain('existing.server_version = incoming.base_version');
    expect(sql).toContain('existing.user_id = $1');
    expect(sql).toContain('deleted_at = case when incoming.should_delete then now() else null end');
    expect(sql).not.toContain('excluded.updated_at');
    // user_id param is the SESSION user, never from the body.
    expect((call![1] as unknown[])[0]).toBe('u1');
  });

  it('strips local routing-hint fields that are not in the sync contract', async () => {
    // default_privacy_mode is intentionally NOT a wire field; zod strips unknown keys,
    // so the insert SQL must never reference it.
    const res = await POST(
      postReq({
        projects: [
          {
            id: '0190a000-0000-7000-8000-0000000000d2',
            name: 'X',
            baseVersion: '0',
            updatedAt: '2026-06-22T00:00:00.000Z',
            default_privacy_mode: 'local',
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const call = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('insert into user_projects'),
    );
    expect(String(call![0])).not.toContain('privacy_mode');
    const pushed = JSON.parse(String((call![1] as unknown[])[1]));
    expect(pushed[0].default_privacy_mode).toBeUndefined();
  });
});

describe('GET /api/projects/sync — pull', () => {
  it('delivers tombstones (does not filter deleted_at) and returns the cursor', async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: '0190a000-0000-7000-8000-0000000000d3',
        name: 'Deleted project',
        description: null,
        instructions: null,
        color: null,
        is_archived: false,
        metadata: null,
        created_at: '2026-06-20T00:00:00.000Z',
        updated_at: '2026-06-22T00:00:00.000Z',
        deleted_at: '2026-06-22T00:00:00.000Z',
        server_version: '15',
      },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/projects/sync?since=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cursor).toBe('15');
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].deleted_at).not.toBeNull();
    const call = queryMock.mock.calls.find((c) => String(c[0]).includes('from user_projects'));
    expect(String(call![0])).not.toContain('deleted_at is null');
  });
});
