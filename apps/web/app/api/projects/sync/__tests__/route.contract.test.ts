import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  ProjectsSyncPullResponseSchema,
  ProjectsSyncPushResponseSchema,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetSubscription, releaseContents, transactionState } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetSubscription: vi.fn(),
  releaseContents: vi.fn(async (_tx: unknown, _scope: unknown) => undefined),
  transactionState: { active: false, committed: 0 },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mockQuery(...args),
      transaction: async (run: (tx: unknown) => unknown) => {
        transactionState.active = true;
        try {
          const result = await run({ query: (...args: unknown[]) => mockQuery(...args) });
          transactionState.committed++;
          return result;
        } finally {
          transactionState.active = false;
        }
      },
    },
    userId: 'user_contract_1',
    organizationId: '11111111-1111-4111-8111-111111111111',
  })),
}));

vi.mock('@/lib/server/project-deletion', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  releaseDeletedProjectContents: releaseContents,
  assertProjectContentUnheld: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));

import { GET, POST } from '../route';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getProjectLimit } from '@/lib/services/free-plan-entitlements';

const PROJ_ID = '018f6f2a-0000-7000-8000-000000000020';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

const projectRow = {
  id: PROJ_ID,
  name: 'Mobile launch',
  description: null,
  instructions: 'Ship it',
  color: '#ff0000',
  is_archived: false,
  metadata: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  deleted_at: null,
  server_version: '3',
};

describe('GET /api/projects/sync, shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pull page (incl. tombstone) parses', async () => {
    mockQuery.mockResolvedValueOnce([
      projectRow,
      {
        ...projectRow,
        id: '018f6f2a-0000-7000-8000-000000000021',
        deleted_at: '2026-07-02T00:00:00.000Z',
        server_version: '4',
      },
    ]);

    const res = await GET(
      new Request('http://localhost:3000/api/projects/sync?since=0', { method: 'GET' }) as never,
    );
    expect(res.status).toBe(200);

    const parsed = ProjectsSyncPullResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cursor).toBe('4');
      expect(parsed.data.workspaceScope).toBe(ORGANIZATION_ID);
    }
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('organization_id is not distinct from $3::uuid');
    expect(params[2]).toBe(ORGANIZATION_ID);
  });

  it('names the personal workspace a pull was resolved for', async () => {
    vi.mocked(getUserScopedDb).mockResolvedValueOnce({
      db: { query: (...args: unknown[]) => mockQuery(...args) },
      userId: 'user_contract_1',
      organizationId: null,
    } as never);
    mockQuery.mockResolvedValueOnce([]);
    const res = await GET(
      new Request('http://localhost:3000/api/projects/sync?since=0', { method: 'GET' }) as never,
    );
    const body = ProjectsSyncPullResponseSchema.parse(await res.json());
    expect(body.workspaceScope).toBe(MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBeNull();
  });

  it('empty pull page parses', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const res = await GET(
      new Request('http://localhost:3000/api/projects/sync?since=99', { method: 'GET' }) as never,
    );
    expect(ProjectsSyncPullResponseSchema.safeParse(await res.json()).success).toBe(true);
  });

  it('rejects a cursor outside the PostgreSQL bigint range before querying', async () => {
    const res = await GET(
      new Request('http://localhost:3000/api/projects/sync?since=9999999999999999999', {
        method: 'GET',
      }) as never,
    );

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/sync, shared cloud contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionState.committed = 0;
    mockGetSubscription.mockResolvedValue({ plan_tier: 'free' });
  });

  const deletePush = () =>
    POST(
      new Request('http://localhost:3000/api/projects/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projects: [
            {
              id: PROJ_ID,
              name: 'Removed project',
              baseVersion: '3',
              deletedAt: '2026-11-10T00:00:00Z',
            },
          ],
        }),
      }) as never,
    );

  it('releases tombstoned content inside the publishing transaction', async () => {
    mockQuery.mockResolvedValueOnce([
      { kind: 'applied', id: PROJ_ID, server_version: '6', current: null },
    ]);
    releaseContents.mockImplementationOnce(async (_tx, scope) => {
      expect(transactionState.active).toBe(true);
      expect(scope).toEqual({
        projectId: PROJ_ID,
        userId: 'user_contract_1',
        organizationId: ORGANIZATION_ID,
      });
    });
    expect((await deletePush()).status).toBe(200);
    expect(releaseContents).toHaveBeenCalledOnce();
    expect(transactionState.committed).toBe(1);
  });

  it('does not acknowledge a tombstone whose content release fails', async () => {
    mockQuery.mockResolvedValueOnce([
      { kind: 'applied', id: PROJ_ID, server_version: '6', current: null },
    ]);
    releaseContents.mockRejectedValueOnce(new Error('Retirement unavailable'));
    const response = await deletePush();
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('applied');
    expect(transactionState.committed).toBe(0);
  });

  it('push ack parses against ProjectsSyncPushResponseSchema', async () => {
    mockQuery.mockResolvedValueOnce([
      { kind: 'applied', id: PROJ_ID, server_version: '5', current: null },
    ]);

    const res = await POST(
      new Request('http://localhost:3000/api/projects/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projects: [
            {
              id: PROJ_ID,
              name: 'Mobile launch',
              baseVersion: '0',
              updatedAt: '2999-01-01T00:00:00.000Z',
            },
          ],
        }),
      }) as never,
    );
    expect(res.status).toBe(200);

    const parsed = ProjectsSyncPushResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cursor).toBe('5');
      expect(parsed.data.conflicts).toEqual([]);
    }

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('existing.server_version = incoming.base_version');
    expect(sql).toContain('existing.organization_id is not distinct from $4::uuid');
    expect(sql).toContain('(id, user_id, organization_id, name');
    expect(sql).toContain('deleted_at = case when incoming.should_delete then now() else null end');
    expect(sql).toContain('assert_user_resource_limit(');
    expect(sql).toContain("'projects'");
    expect(params[2]).toBe(1);
    expect(params[3]).toBe(ORGANIZATION_ID);
    const pushed = JSON.parse(String(params[1]));
    expect(pushed[0].baseVersion).toBe('0');
    expect(pushed[0].updatedAt).toBeUndefined();
  });

  it.each([
    ['an unrecognised tier', { plan_tier: 'starter', status: 'active' }],
    ['a lapsed Pro subscription', { plan_tier: 'pro', status: 'canceled' }],
  ])('holds %s to the Free project limit the database enforces', async (_label, subscription) => {
    mockGetSubscription.mockResolvedValue(subscription);
    mockQuery.mockResolvedValueOnce([
      { kind: 'applied', id: PROJ_ID, server_version: '5', current: null },
    ]);

    const res = await POST(
      new Request('http://localhost:3000/api/projects/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projects: [{ id: PROJ_ID, name: 'Held to Free', baseVersion: '0' }],
        }),
      }) as never,
    );

    expect(res.status).toBe(200);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(getProjectLimit('free'));
  });

  it('passes an active Pro subscription its own project limit', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
    mockQuery.mockResolvedValueOnce([
      { kind: 'applied', id: PROJ_ID, server_version: '5', current: null },
    ]);

    await POST(
      new Request('http://localhost:3000/api/projects/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projects: [{ id: PROJ_ID, name: 'Pro', baseVersion: '0' }] }),
      }) as never,
    );

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(getProjectLimit('pro'));
    expect(params[2]).not.toBe(getProjectLimit('free'));
  });

  it('holds a restore-only batch to the project limit instead of skipping the quota check', async () => {
    mockQuery.mockResolvedValueOnce([
      { kind: 'applied', id: PROJ_ID, server_version: '6', current: null },
    ]);

    const res = await POST(
      new Request('http://localhost:3000/api/projects/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projects: [{ id: PROJ_ID, name: 'Restored', baseVersion: '5', deletedAt: null }],
        }),
      }) as never,
    );

    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    const compact = sql.replace(/\s+/g, ' ');
    expect(compact).toContain('stored.deleted_at is not null');
    expect(compact).toContain('incoming.should_delete as tombstoned');
    expect(compact).toContain('where not updated.tombstoned');
    expect(compact).toContain('updated.id in (select id from prior_tombstones)');
    expect(compact).toContain('case when dependency.admitted_count > 0 then $3 else null end');
    expect(compact).not.toContain('inserted_count');
    expect(params[2]).toBe(getProjectLimit('free'));
  });

  it('returns the current server row when a stale baseVersion loses CAS', async () => {
    mockQuery.mockResolvedValueOnce([
      { kind: 'conflict', id: PROJ_ID, server_version: null, current: projectRow },
    ]);

    const res = await POST(
      new Request('http://localhost:3000/api/projects/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projects: [{ id: PROJ_ID, name: 'Stale edit', baseVersion: '2' }],
        }),
      }) as never,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      applied: [],
      conflicts: [{ id: PROJ_ID, current: projectRow }],
      cursor: '3',
    });
  });

  it('executes a mixed compare-and-swap batch in one database round trip', async () => {
    const secondId = '018f6f2a-0000-7000-8000-000000000022';
    mockQuery.mockResolvedValueOnce([
      { kind: 'applied', id: PROJ_ID, server_version: '5', current: null },
      {
        kind: 'conflict',
        id: secondId,
        server_version: null,
        current: { ...projectRow, id: secondId },
      },
    ]);

    const res = await POST(
      new Request('http://localhost:3000/api/projects/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projects: [
            { id: PROJ_ID, name: 'Applied', baseVersion: '3' },
            { id: secondId, name: 'Stale', baseVersion: '2' },
          ],
        }),
      }) as never,
    );

    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.applied).toEqual([{ id: PROJ_ID, server_version: '5' }]);
    expect(body.conflicts).toEqual([{ id: secondId, current: { ...projectRow, id: secondId } }]);
    expect(body.cursor).toBe('5');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('jsonb_array_elements($2::jsonb)');
    expect(params[0]).toBe('user_contract_1');
    expect(JSON.parse(String(params[1]))).toHaveLength(2);
  });
});
