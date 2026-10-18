import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  resolveActiveOrganizationId: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => dbMocks,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: dbMocks.resolveActiveOrganizationId,
}));

import { insertMediaAssetsAtomically, type InsertMediaAssetParams } from './media-assets';
import { createDatabaseAdapterFake } from '@/test/database-adapter-fake';

const callerDb = createDatabaseAdapterFake({
  query: async <T>(sql: string, params?: unknown[]): Promise<T[]> =>
    (await dbMocks.query(sql, params)) as T[],
  transaction: async <T>(run: (tx: never) => Promise<T>): Promise<T> =>
    (await dbMocks.transaction(run)) as T,
});

function image(pathname: string): InsertMediaAssetParams {
  return {
    userId: 'user-1',
    organizationId: 'org-admitted',
    kind: 'image',
    mimeType: 'image/png',
    byteSize: 12,
    storageUrl: pathname,
    storagePathname: pathname,
    prompt: 'two cats',
    provider: 'openai',
    model: 'fixture-image-model',
    sourceSurface: 'web',
  };
}

describe('insertMediaAssetsAtomically', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.transaction.mockImplementation(async (callback) => callback({ query: dbMocks.query }));
  });

  it('returns identities only after every row runs inside one transaction', async () => {
    dbMocks.query
      .mockResolvedValueOnce([{ id: 'asset-1' }])
      .mockResolvedValueOnce([{ id: 'asset-2' }]);

    await expect(
      insertMediaAssetsAtomically([image('media/first.png'), image('media/second.png')], callerDb),
    ).resolves.toEqual(['asset-1', 'asset-2']);
    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
    expect(dbMocks.query).toHaveBeenCalledTimes(2);
    expect(dbMocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
    const [insertSql, insertParams] = dbMocks.query.mock.calls[0] as [string, unknown[]];
    expect(insertSql).toContain('(user_id, organization_id, kind');
    expect(insertParams.slice(0, 2)).toEqual(['user-1', 'org-admitted']);
  });

  it('preserves explicitly captured Personal provenance without re-resolving workspace', async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: 'asset-1' }]);

    await expect(
      insertMediaAssetsAtomically(
        [{ ...image('media/first.png'), organizationId: null }],
        callerDb,
      ),
    ).resolves.toEqual(['asset-1']);

    expect(dbMocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
    expect(dbMocks.query.mock.calls[0]?.[1]?.[1]).toBeNull();
  });

  it('rejects the batch when any row fails instead of returning a partial identity list', async () => {
    dbMocks.query
      .mockResolvedValueOnce([{ id: 'asset-1' }])
      .mockRejectedValueOnce(new Error('second insert failed'));

    await expect(
      insertMediaAssetsAtomically([image('media/first.png'), image('media/second.png')], callerDb),
    ).rejects.toThrow('second insert failed');
    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
  });
});
