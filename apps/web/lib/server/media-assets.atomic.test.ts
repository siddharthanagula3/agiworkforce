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

import {
  insertMediaAssetsAtomically,
  isMediaAssetStoreReady,
  type InsertMediaAssetParams,
} from './media-assets';

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
      insertMediaAssetsAtomically([image('media/first.png'), image('media/second.png')], dbMocks),
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
      insertMediaAssetsAtomically([{ ...image('media/first.png'), organizationId: null }], dbMocks),
    ).resolves.toEqual(['asset-1']);

    expect(dbMocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
    expect(dbMocks.query.mock.calls[0]?.[1]?.[1]).toBeNull();
  });

  it('rejects the batch when any row fails instead of returning a partial identity list', async () => {
    dbMocks.query
      .mockResolvedValueOnce([{ id: 'asset-1' }])
      .mockRejectedValueOnce(new Error('second insert failed'));

    await expect(
      insertMediaAssetsAtomically([image('media/first.png'), image('media/second.png')], dbMocks),
    ).rejects.toThrow('second insert failed');
    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('isMediaAssetStoreReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires the complete current image and video catalog columns', async () => {
    dbMocks.query.mockResolvedValueOnce([{ ready: true }]);

    await expect(isMediaAssetStoreReady(dbMocks)).resolves.toBe(true);
    const requiredColumns = JSON.parse(String(dbMocks.query.mock.calls[0]?.[1]?.[0])) as Array<{
      column_name: string;
      udt_name: string;
      is_nullable: string;
      default_policy: 'required' | 'forbidden';
    }>;
    expect(requiredColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column_name: 'storage_pathname', udt_name: 'text' }),
        expect.objectContaining({
          column_name: 'organization_id',
          udt_name: 'uuid',
          is_nullable: 'YES',
          default_policy: 'forbidden',
        }),
        expect.objectContaining({
          column_name: 'conversation_id',
          udt_name: 'uuid',
          is_nullable: 'YES',
          default_policy: 'forbidden',
        }),
      ]),
    );
    const readinessSql = String(dbMocks.query.mock.calls[0]?.[0]);
    expect(readinessSql).toContain('actual.udt_name = required.udt_name');
    expect(readinessSql).toContain('actual.is_nullable = required.is_nullable');
    expect(readinessSql).toContain("when 'forbidden' then actual.column_default is null");
    expect(readinessSql).toContain("fk.confrelid = to_regclass('public.web_conversations')");
    expect(readinessSql).toContain("target_column.attname = 'id'");
    expect(readinessSql).toContain("fk.confdeltype = 'n'");
    expect(readinessSql).toContain('fk.convalidated');
    expect(readinessSql).toContain('and 1 = (');
    expect(readinessSql).toContain('select count(*)');
  });

  it('fails closed for a partially migrated media catalog', async () => {
    dbMocks.query.mockResolvedValueOnce([{ ready: false }]);

    await expect(isMediaAssetStoreReady(dbMocks)).resolves.toBe(false);
  });

  it('fails closed for a missing table or column while surfacing infrastructure errors', async () => {
    dbMocks.query.mockRejectedValueOnce({ code: '42703' });
    await expect(isMediaAssetStoreReady(dbMocks)).resolves.toBe(false);

    dbMocks.query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(isMediaAssetStoreReady(dbMocks)).rejects.toThrow('database unavailable');
  });
});
