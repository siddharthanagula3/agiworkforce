import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveActiveOrganizationId: vi.fn(),
}));

const callerDb = { query: mocks.query } as never;

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mocks.resolveActiveOrganizationId,
}));

vi.mock('@/lib/server/media-storage', () => ({ deleteStoredMedia: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  deleteVideoMediaAsset,
  getActiveWorkspaceMediaAssetById,
  getMediaAssetByStoragePathname,
  insertMediaAsset,
  listMediaAssets,
  softDeleteMediaAsset,
  upsertVideoMediaAsset,
} from './media-assets';

const USER_ID = 'user-owner';
const ORGANIZATION_ID = '33333333-3333-4333-8333-333333333333';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';

function assetRow() {
  return {
    id: ASSET_ID,
    user_id: USER_ID,
    kind: 'file',
    mime_type: 'application/pdf',
    byte_size: 12,
    storage_url: '/api/files/asset',
    storage_pathname: 'media/file/asset.pdf',
    prompt: null,
    provider: null,
    model: null,
    width: null,
    height: null,
    metadata: {},
    created_at: '2026-08-11T00:00:00.000Z',
    deleted_at: null,
  };
}

describe('media asset active-workspace scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActiveOrganizationId.mockResolvedValue(ORGANIZATION_ID);
    mocks.query.mockResolvedValue([]);
  });

  it('stamps inserts with admitted organization provenance without re-resolving', async () => {
    mocks.query.mockResolvedValue([{ id: ASSET_ID }]);

    await expect(
      insertMediaAsset(
        {
          userId: USER_ID,
          organizationId: ORGANIZATION_ID,
          kind: 'file',
          mimeType: 'application/pdf',
          storageUrl: '/api/files/asset',
        },
        callerDb,
      ),
    ).resolves.toBe(ASSET_ID);

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('(user_id, organization_id, kind');
    expect(params.slice(0, 2)).toEqual([USER_ID, ORGANIZATION_ID]);
    expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
  });

  it('preserves explicit durable video organization provenance', async () => {
    mocks.query.mockResolvedValue([{ id: ASSET_ID }]);

    await expect(
      upsertVideoMediaAsset(
        {
          id: ASSET_ID,
          userId: USER_ID,
          organizationId: ORGANIZATION_ID,
          mimeType: 'video/mp4',
          storageUrl: '/api/files/asset',
          storagePathname: 'media/video/asset.mp4',
          byteSize: 12,
          prompt: 'fixture prompt',
          provider: 'fixture-provider',
          model: 'fixture-model',
          sourceSurface: 'web',
          metadata: {},
        },
        callerDb,
      ),
    ).resolves.toBe(ASSET_ID);

    expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0]?.[1]?.[2]).toBe(ORGANIZATION_ID);
  });

  it('uses the durable job organization when compensating a video asset', async () => {
    mocks.query.mockResolvedValue([{ id: ASSET_ID }]);

    await expect(deleteVideoMediaAsset(ASSET_ID, USER_ID, callerDb)).resolves.toBe(true);

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('from public.video_generation_jobs job');
    expect(sql).toContain('media_assets.organization_id is not distinct from job.organization_id');
    expect(params).toEqual([ASSET_ID, USER_ID]);
    expect(mocks.resolveActiveOrganizationId).not.toHaveBeenCalled();
  });

  it('uses one indistinguishable miss for foreign and inactive-workspace reads', async () => {
    await expect(getActiveWorkspaceMediaAssetById(USER_ID, ASSET_ID, callerDb)).resolves.toBeNull();

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('user_id = $2');
    expect(sql).toContain('organization_id is not distinct from $3::uuid');
    expect(params).toEqual([ASSET_ID, USER_ID, ORGANIZATION_ID]);
  });

  it('keeps Personal reads and listings strictly on null organization', async () => {
    mocks.resolveActiveOrganizationId.mockResolvedValue(null);
    mocks.query.mockResolvedValue([assetRow()]);

    await expect(
      getMediaAssetByStoragePathname(USER_ID, 'media/file/asset.pdf', null, callerDb),
    ).resolves.toMatchObject({ id: ASSET_ID });
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([USER_ID, 'media/file/asset.pdf', null]);

    mocks.query.mockClear();
    await expect(listMediaAssets(USER_ID, {}, callerDb)).resolves.toHaveLength(1);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('organization_id is not distinct from $2::uuid');
    expect(params).toEqual([USER_ID, null]);
  });

  it('cannot soft-delete an identically owned asset outside the active workspace', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(softDeleteMediaAsset(USER_ID, ASSET_ID, callerDb)).resolves.toBe(false);

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('organization_id is not distinct from $3::uuid');
    expect(params).toEqual([ASSET_ID, USER_ID, ORGANIZATION_ID]);
  });
});
