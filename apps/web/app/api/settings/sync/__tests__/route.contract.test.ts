/**
 * Contract test for GET/POST /api/settings/sync.
 *
 * Asserts the live route handlers' JSON output parses against the shared
 * `SettingsSyncPullResponseSchema` / `SettingsSyncPushResponseSchema` from
 * @agiworkforce/cloud-contracts — the schemas mobile's cloudSyncEngine validates
 * pulled settings documents with. (The allowlist/secret-scrub behavior has
 * its own dedicated tests; this file pins only the response envelope.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SettingsSyncPullResponseSchema,
  SettingsSyncPushResponseSchema,
} from '@agiworkforce/cloud-contracts';

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

describe('GET /api/settings/sync — shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('changed settings document parses', async () => {
    mockQuery.mockResolvedValueOnce([
      { settings: { appearance: { theme: 'dark' } }, server_version: '12' },
    ]);

    const res = await GET(
      new Request('http://localhost:3000/api/settings/sync?since=0', { method: 'GET' }) as never,
    );
    expect(res.status).toBe(200);

    const parsed = SettingsSyncPullResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cursor).toBe('12');
      expect(parsed.data.hasMore).toBe(false);
    }
  });

  it('nothing-new response parses', async () => {
    mockQuery.mockResolvedValueOnce([{ settings: { appearance: {} }, server_version: '5' }]);

    const res = await GET(
      new Request('http://localhost:3000/api/settings/sync?since=5', { method: 'GET' }) as never,
    );
    const parsed = SettingsSyncPullResponseSchema.safeParse(await res.json());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.settings).toEqual({});
  });

  it('rejects a cursor outside the PostgreSQL bigint range before querying', async () => {
    const res = await GET(
      new Request('http://localhost:3000/api/settings/sync?since=9999999999999999999', {
        method: 'GET',
      }) as never,
    );

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings/sync — shared cloud contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merged push ack parses', async () => {
    mockQuery.mockResolvedValueOnce([{ server_version: '13' }]);

    const res = await POST(
      new Request('http://localhost:3000/api/settings/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          settings: { appearance: { theme: 'dark' } },
          baseVersion: '0',
        }),
      }) as never,
    );
    expect(res.status).toBe(200);

    const parsed = SettingsSyncPushResponseSchema.safeParse(await res.json());
    expect(parsed.error).toBeUndefined();
    expect(parsed.success).toBe(true);
  });
});
