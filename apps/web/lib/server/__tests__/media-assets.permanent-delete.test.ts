import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteStoredMedia, query, transaction, resolveActiveOrganizationId } = vi.hoisted(() => {
  const query = vi.fn();
  return {
    deleteStoredMedia: vi.fn(),
    query,
    transaction: vi.fn(async (callback: (tx: { query: typeof query }) => Promise<unknown>) =>
      callback({ query }),
    ),
    resolveActiveOrganizationId: vi.fn(),
  };
});

const callerDb = { query, transaction } as never;
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMedia: (...args: unknown[]) => deleteStoredMedia(...args),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({ resolveActiveOrganizationId }));

import { permanentlyDeleteMediaAsset } from '../media-assets';

describe('permanentlyDeleteMediaAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveActiveOrganizationId.mockResolvedValue('org-1');
  });

  it('locks the owner-scoped trashed row, deletes bytes, then removes the row', async () => {
    query
      .mockResolvedValueOnce([{ storage_pathname: 'users/owner/asset.bin' }])
      .mockResolvedValueOnce([{ id: 'asset-1' }]);

    await expect(permanentlyDeleteMediaAsset('owner', 'asset-1', callerDb)).resolves.toBe(true);

    const [selectSql, selectParams] = query.mock.calls[0] as [string, unknown[]];
    expect(selectSql).toMatch(
      /user_id = \$2[\s\S]*organization_id is not distinct from \$3::uuid[\s\S]*deleted_at is not null[\s\S]*for update/i,
    );
    expect(selectParams).toEqual(['asset-1', 'owner', 'org-1']);
    expect(deleteStoredMedia).toHaveBeenCalledWith('users/owner/asset.bin');
    expect(query.mock.calls[1]?.[0]).toMatch(/delete from public\.media_assets/i);
    expect(query.mock.calls[1]?.[1]).toEqual(['asset-1', 'owner', 'org-1']);
  });

  it('does not touch storage when the asset is live, foreign, or absent', async () => {
    query.mockResolvedValueOnce([]);

    await expect(permanentlyDeleteMediaAsset('owner', 'asset-1', callerDb)).resolves.toBe(false);
    expect(deleteStoredMedia).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual(['asset-1', 'owner', 'org-1']);
  });

  it('keeps the database row retryable when storage deletion fails', async () => {
    query.mockResolvedValueOnce([{ storage_pathname: 'users/owner/asset.bin' }]);
    deleteStoredMedia.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(permanentlyDeleteMediaAsset('owner', 'asset-1', callerDb)).rejects.toThrow(
      'storage unavailable',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
