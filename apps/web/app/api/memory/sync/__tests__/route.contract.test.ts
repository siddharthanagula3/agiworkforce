import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemorySyncPullResponseSchema,
  MemorySyncPushResponseSchema,
  SYNC_PROTOCOL_MIN_VERSION,
  SYNC_PROTOCOL_VERSION,
} from '@agiworkforce/cloud-contracts';
import { ERROR_CODE_TO_HTTP_STATUS, ErrorCode } from '@agiworkforce/types';

const CLIENT_UPDATE_REQUIRED_STATUS = ERROR_CODE_TO_HTTP_STATUS[ErrorCode.CLIENT_UPDATE_REQUIRED];

function makeMemoryPush(body: unknown) {
  return new Request('http://localhost:3000/api/memory/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

vi.mock('server-only', () => ({}));

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

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

describe('GET /api/memory/sync?since=, shared cloud contract', () => {
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

  it('rejects a cursor outside the PostgreSQL bigint range before querying', async () => {
    const res = await GET(
      new Request('http://localhost:3000/api/memory/sync?since=9999999999999999999', {
        method: 'GET',
      }) as never,
    );

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('POST /api/memory/sync { memories }, shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('push ack parses against MemorySyncPushResponseSchema', async () => {
    mockQuery.mockImplementation(async (sql: unknown) =>
      String(sql).includes("settings -> 'capabilities'")
        ? [{ capabilities: { memory: true } }]
        : [{ kind: 'applied', id: MEM_ID, server_version: '9', current: null }],
    );

    const res = await POST(
      new Request('http://localhost:3000/api/memory/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: 2,
          memories: [
            {
              id: MEM_ID,
              content: 'User prefers dark mode',
              baseVersion: '0',
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

  it('explicitly rejects a legacy mutable push', async () => {
    const res = await POST(
      makeMemoryPush({ memories: [{ id: MEM_ID, content: 'x', updatedAt: '2999-01-01' }] }),
    );
    expect(res.status).toBe(CLIENT_UPDATE_REQUIRED_STATUS);
    const body = await res.json();
    expect(body).toMatchObject({ error: { code: 'CLIENT_UPDATE_REQUIRED' } });
    expect(body.error.message).toContain(String(SYNC_PROTOCOL_MIN_VERSION));
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a caller below the floor with the remedy, not a field-by-field parse failure', async () => {
    const res = await POST(makeMemoryPush({ protocolVersion: 1, memories: [] }));
    expect(res.status).toBe(CLIENT_UPDATE_REQUIRED_STATUS);
    expect(await res.json()).toMatchObject({ error: { code: 'CLIENT_UPDATE_REQUIRED' } });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does not tell a caller ahead of this deployment to update itself', async () => {
    const res = await POST(
      makeMemoryPush({ protocolVersion: SYNC_PROTOCOL_VERSION + 1, memories: [] }),
    );
    expect(res.status).not.toBe(CLIENT_UPDATE_REQUIRED_STATUS);
    const body = await res.json();
    expect(body.error.code).not.toBe('CLIENT_UPDATE_REQUIRED');
    expect(body.error.message).toContain(String(SYNC_PROTOCOL_VERSION));
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
