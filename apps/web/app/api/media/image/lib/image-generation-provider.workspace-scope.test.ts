import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

type MediaAssetsModule = typeof import('@/lib/server/media-assets');
type MediaStorageModule = typeof import('@/lib/server/media-storage');

const sources = vi.hoisted(() => ({ byId: vi.fn(), read: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/media-assets', async (importOriginal) => ({
  ...(await importOriginal<MediaAssetsModule>()),
  getActiveWorkspaceMediaAssetById: sources.byId,
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<MediaStorageModule>()),
  readStoredMedia: sources.read,
}));

import { resolveImageRefBytes } from './image-generation-provider';

const db = {} as DatabaseAdapter;
const bytes = Uint8Array.from([1, 2, 3]);

describe('generation source workspace authority', () => {
  beforeEach(() => {
    sources.byId.mockReset().mockResolvedValue({
      kind: 'image',
      mimeType: 'image/png',
      deletedAt: null,
      storagePathname: 'fixture/source.png',
    });
    sources.read.mockReset().mockResolvedValue({ data: bytes });
  });

  it.each([null, '00000000-0000-4000-8000-000000000001'])(
    'passes the admitted workspace %s without replacing Personal',
    async (organizationId) => {
      await expect(
        resolveImageRefBytes({ asset_id: 'fixture-asset' }, 'fixture-user', db, organizationId),
      ).resolves.toEqual(bytes);
      expect(sources.byId).toHaveBeenCalledWith('fixture-user', 'fixture-asset', db, {
        organizationId,
      });
      expect(sources.read).toHaveBeenCalledWith('fixture/source.png');
    },
  );

  it('rejects unknown scope before any asset lookup or private byte read', async () => {
    await expect(
      resolveImageRefBytes({ asset_id: 'fixture-asset' }, 'fixture-user', db),
    ).rejects.toThrow('Source image workspace could not be verified');
    expect(sources.byId).not.toHaveBeenCalled();
    expect(sources.read).not.toHaveBeenCalled();
  });

  it('does not require a workspace for inline bytes', async () => {
    await expect(
      resolveImageRefBytes({ b64_json: Buffer.from(bytes).toString('base64') }, 'fixture-user'),
    ).resolves.toEqual(bytes);
    expect(sources.byId).not.toHaveBeenCalled();
    expect(sources.read).not.toHaveBeenCalled();
  });

  it('rejects an asset outside the admitted scope before reading bytes', async () => {
    sources.byId.mockResolvedValue(null);
    await expect(
      resolveImageRefBytes({ asset_id: 'fixture-asset' }, 'fixture-user', db, null),
    ).rejects.toThrow('Source image not found');
    expect(sources.read).not.toHaveBeenCalled();
  });
});
