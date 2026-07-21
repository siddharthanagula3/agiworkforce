import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mockQuery }) }));

import { restoreMediaAsset } from '../media-assets';

describe('restoreMediaAsset (Recently-deleted bin restore)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un-deletes only within the 30-day window, owner-scoped, and returns true on a hit', async () => {
    mockQuery.mockResolvedValue([{ id: 'asset-1' }]);
    const ok = await restoreMediaAsset('user-owner', 'asset-1');
    expect(ok).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('set deleted_at = null');
    // Guards: must be currently soft-deleted AND inside the 30-day recovery window.
    expect(sql).toContain('deleted_at is not null');
    expect(sql).toContain("deleted_at > now() - interval '30 days'");
    // Owner scoping — id is $1, user is $2.
    expect(sql).toContain('user_id = $2');
    expect(params).toEqual(['asset-1', 'user-owner']);
  });

  it('returns false when nothing was restorable (already live / not owned / purged)', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await restoreMediaAsset('user-owner', 'asset-1')).toBe(false);
  });
});
