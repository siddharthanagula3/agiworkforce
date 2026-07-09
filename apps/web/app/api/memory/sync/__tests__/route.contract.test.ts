/**
 * Contract test for GET/POST /api/memory/sync (delta paths).
 *
 * Asserts the live route handlers' JSON output parses against the shared
 * `MemorySyncPullResponseSchema` / `MemorySyncPushResponseSchema` from
 * @agiworkforce/services — the schemas mobile's cloudSyncEngine validates
 * pulled memory pages with. The legacy status/trigger paths (no `since`, no
 * `memories`) are separate back-compat shapes and are out of contract scope.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySyncPullResponseSchema, MemorySyncPushResponseSchema } from '@agiworkforce/services';

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

const MEM_ID = '018f6f2a-0000-7000-8000-000000000010';

const memoryRow = {
  id: MEM_ID,
  content: 'User prefers dark mode',
  category: 'preference',
  source: 'mobile',
  pinned: false,
  is_deleted: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  server_version: '7',
};

describe('GET /api/memory/sync?since= — shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pull page (incl. tombstone + null source) parses', async () => {
    mockQuery.mockResolvedValueOnce([
      memoryRow,
      {
        ...memoryRow,
        id: '018f6f2a-0000-7000-8000-000000000011',
        source: null,
        is_deleted: true,
        server_version: '8',
      },
    ]);

    const res = await GET(
      new Request('http://localhost:3000/api/memory/sync?since=0', { method: 'GET' }) as never,
    );
    expect(res.status).toBe(200);

    const parsed = MemorySyncPullResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor).toBe('8');
  });

  it('empty pull page parses', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const res = await GET(
      new Request('http://localhost:3000/api/memory/sync?since=99', { method: 'GET' }) as never,
    );
    expect(MemorySyncPullResponseSchema.safeParse(await res.json()).success).toBe(true);
  });
});

describe('POST /api/memory/sync { memories } — shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('push ack parses against MemorySyncPushResponseSchema', async () => {
    mockQuery.mockResolvedValueOnce([{ id: MEM_ID, server_version: '9' }]);

    const res = await POST(
      new Request('http://localhost:3000/api/memory/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memories: [
            {
              id: MEM_ID,
              content: 'User prefers dark mode',
              updatedAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        }),
      }) as never,
    );
    expect(res.status).toBe(200);

    const parsed = MemorySyncPushResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cursor).toBe('9');
  });
});
