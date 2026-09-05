import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery, mockResolveActiveOrganizationId } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockResolveActiveOrganizationId: vi.fn(),
}));
const callerDb = { query: mockQuery } as never;
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mockResolveActiveOrganizationId,
}));

import { restoreMediaAsset } from '../media-assets';

describe('restoreMediaAsset (Recently-deleted bin restore)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveActiveOrganizationId.mockResolvedValue('org-1');
  });

  it('un-deletes only within the 30-day window, owner-scoped, and returns true on a hit', async () => {
    mockQuery.mockResolvedValue([{ id: 'asset-1' }]);
    const ok = await restoreMediaAsset('user-owner', 'asset-1', callerDb);
    expect(ok).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('set deleted_at = null');
    expect(sql).toContain('deleted_at is not null');
    expect(sql).toContain("deleted_at > now() - interval '30 days'");
    expect(sql).toContain('user_id = $2');
    expect(sql).toContain('organization_id is not distinct from $3::uuid');
    expect(params).toEqual(['asset-1', 'user-owner', 'org-1']);
  });

  it('returns false without leaking a Personal/foreign/purged row into an org workspace', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await restoreMediaAsset('user-owner', 'asset-1', callerDb)).toBe(false);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['asset-1', 'user-owner', 'org-1']);
  });
});
