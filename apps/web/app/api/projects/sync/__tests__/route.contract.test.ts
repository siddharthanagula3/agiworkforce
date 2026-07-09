/**
 * Contract test for GET/POST /api/projects/sync.
 *
 * Asserts the live route handlers' JSON output parses against the shared
 * `ProjectsSyncPullResponseSchema` / `ProjectsSyncPushResponseSchema` from
 * @agiworkforce/services — the schemas mobile's cloudSyncEngine validates
 * pulled project pages with.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProjectsSyncPullResponseSchema,
  ProjectsSyncPushResponseSchema,
} from '@agiworkforce/services';

vi.mock('server-only', () => ({}));

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

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
  })),
}));

import { GET, POST } from '../route';

const PROJ_ID = '018f6f2a-0000-7000-8000-000000000020';

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
  });

  it('empty pull page parses', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const res = await GET(
      new Request('http://localhost:3000/api/projects/sync?since=99', { method: 'GET' }) as never,
    );
    expect(ProjectsSyncPullResponseSchema.safeParse(await res.json()).success).toBe(true);
  });
});

describe('POST /api/projects/sync — shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('push ack parses against ProjectsSyncPushResponseSchema', async () => {
    mockQuery.mockResolvedValueOnce([{ id: PROJ_ID, server_version: '5' }]);

    const res = await POST(
      new Request('http://localhost:3000/api/projects/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projects: [{ id: PROJ_ID, name: 'Mobile launch', updatedAt: '2026-07-01T00:00:00.000Z' }],
        }),
      }) as never,
    );
    expect(res.status).toBe(200);

    const parsed = ProjectsSyncPushResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor).toBe('5');
  });
});
