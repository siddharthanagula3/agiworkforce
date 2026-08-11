/**
 * Contract test for GET/POST /api/projects/sync.
 *
 * Asserts the live route handlers' JSON output parses against the shared
 * `ProjectsSyncPullResponseSchema` / `ProjectsSyncPushResponseSchema` from
 * @agiworkforce/cloud-contracts — the schemas mobile's cloudSyncEngine validates
 * pulled project pages with.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProjectsSyncPullResponseSchema,
  ProjectsSyncPushResponseSchema,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetSubscription } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetSubscription: vi.fn(),
}));

// vi.fn(impl) creation-time implementations survive the config-level
// `mockReset: true` (which wipes .mockResolvedValue set in factories).
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
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user_contract_1',
    organizationId: '11111111-1111-4111-8111-111111111111',
  })),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));

import { GET, POST } from '../route';

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

describe('GET /api/projects/sync — shared cloud contract', () => {
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
    if (parsed.success) expect(parsed.data.cursor).toBe('4');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('organization_id is not distinct from $3::uuid');
    expect(params[2]).toBe(ORGANIZATION_ID);
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

describe('POST /api/projects/sync — shared cloud contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSubscription.mockResolvedValue({ plan_tier: 'free' });
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

  it('fails closed for an unknown subscription before applying a push', async () => {
    mockGetSubscription.mockResolvedValue({ plan_tier: 'starter' });

    const res = await POST(
      new Request('http://localhost:3000/api/projects/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projects: [{ id: PROJ_ID, name: 'Blocked', baseVersion: '0' }],
        }),
      }) as never,
    );

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
    expect((await res.json()).error.message).toBe(
      'Your current subscription does not allow Managed Cloud Projects. Choose an eligible plan and try again.',
    );
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
