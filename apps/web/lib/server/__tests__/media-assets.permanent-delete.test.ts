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
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ storage_pathname: 'users/owner/asset.bin', held: false }])
      .mockResolvedValueOnce([{ id: 'asset-1' }]);

    await expect(permanentlyDeleteMediaAsset('owner', 'asset-1', callerDb)).resolves.toBe(true);

    const [selectSql, selectParams] = query.mock.calls[1] as [string, unknown[]];
    expect(selectSql).toMatch(
      /user_id = \$2[\s\S]*organization_id is not distinct from \$3::uuid[\s\S]*deleted_at is not null[\s\S]*for update/i,
    );
    expect(selectParams.slice(0, 3)).toEqual(['asset-1', 'owner', 'org-1']);
    expect(deleteStoredMedia).toHaveBeenCalledWith('users/owner/asset.bin');
    expect(query.mock.calls[2]?.[0]).toMatch(/delete from public\.media_assets/i);
    expect((query.mock.calls[2]?.[1] as unknown[]).slice(0, 3)).toEqual([
      'asset-1',
      'owner',
      'org-1',
    ]);
  });

  it('does not touch storage when the asset is live, foreign, or absent', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(permanentlyDeleteMediaAsset('owner', 'asset-1', callerDb)).resolves.toBe(false);
    expect(deleteStoredMedia).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
    expect((query.mock.calls[1]?.[1] as unknown[]).slice(0, 3)).toEqual([
      'asset-1',
      'owner',
      'org-1',
    ]);
  });

  it('keeps the database row retryable when storage deletion fails', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ storage_pathname: 'users/owner/asset.bin', held: false }]);
    deleteStoredMedia.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(permanentlyDeleteMediaAsset('owner', 'asset-1', callerDb)).rejects.toThrow(
      'storage unavailable',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('shares the workspace hold-placement lock before it reads the hold set or touches bytes', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ storage_pathname: 'users/owner/asset.bin', held: false }])
      .mockResolvedValueOnce([{ id: 'asset-1' }]);

    await permanentlyDeleteMediaAsset('owner', 'asset-1', callerDb);

    const [lockSql, lockParams] = query.mock.calls[0] as [string, unknown[]];
    expect(lockSql).toMatch(/pg_advisory_xact_lock_shared/);
    expect(lockParams[0]).toContain('org-1');
    expect(query.mock.calls[1]?.[0]).toMatch(/for update/i);
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(
      deleteStoredMedia.mock.invocationCallOrder[0] as number,
    );
  });

  it('takes no lock for a personal asset that no workspace hold can cover', async () => {
    resolveActiveOrganizationId.mockResolvedValue(null);
    query.mockResolvedValueOnce([]);

    await expect(permanentlyDeleteMediaAsset('owner', 'asset-1', callerDb)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).not.toMatch(/advisory/);
  });
});
