import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteStoredMediaObjects = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMedia: vi.fn(),
  deleteStoredMediaObjects,
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/services/infrastructure-cost', () => ({ recordGeneratedArtifactBytes: vi.fn() }));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn().mockResolvedValue(null),
}));

const {
  insertMediaAsset,
  purgeTemporaryChatFiles,
  saveTemporaryChatAssetToLibrary,
  listMediaAssets,
  TEMPORARY_CHAT_RETENTION_DAYS,
} = await import('../media-assets');
const { temporaryFileCutoff } = await import('../temporary-files');

const NOW_MS = Date.parse('2026-09-18T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  deleteStoredMediaObjects.mockResolvedValue({ deleted: 1, failedPathnames: [] });
});

describe('purgeTemporaryChatFiles', () => {
  it('deletes the stored bytes and the row for a temporary-chat file past the window', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'asset-1', storage_pathname: 'temp/asset-1.png' }])
      .mockResolvedValueOnce([{ id: 'asset-1' }]);

    const result = await purgeTemporaryChatFiles({ query }, { nowMs: NOW_MS });

    const [selectSql, selectParams] = query.mock.calls[0] as [string, unknown[]];
    expect(selectSql).toContain('where temporary_chat');
    expect(selectParams[0]).toBe(temporaryFileCutoff(NOW_MS).toISOString());
    expect(deleteStoredMediaObjects).toHaveBeenCalledWith(['temp/asset-1.png']);
    const [deleteSql, deleteParams] = query.mock.calls[1] as [string, unknown[]];
    expect(deleteSql).toContain('delete from public.media_assets');
    expect(deleteSql).toContain('and temporary_chat');
    expect(deleteParams[0]).toEqual(['asset-1']);
    expect(result).toMatchObject({ candidates: 1, purged: 1, objectsFailed: 0 });
  });

  it('leaves the row when storage still holds the bytes', async () => {
    deleteStoredMediaObjects.mockResolvedValue({
      deleted: 0,
      failedPathnames: ['temp/asset-1.png'],
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'asset-1', storage_pathname: 'temp/asset-1.png' }]);

    const result = await purgeTemporaryChatFiles({ query }, { nowMs: NOW_MS });

    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ purged: 0, objectsFailed: 1 });
  });

  it('uses the same window the conversation gets', () => {
    expect(TEMPORARY_CHAT_RETENTION_DAYS).toBe(30);
    expect(NOW_MS - temporaryFileCutoff(NOW_MS).getTime()).toBe(30 * 86_400_000);
  });
});

describe('a file the user saved to the Library', () => {
  it('loses the flag, so the purge never sees it again', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'asset-1' }]);

    await expect(
      saveTemporaryChatAssetToLibrary('user-1', 'asset-1', { query } as never),
    ).resolves.toBe(true);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('set temporary_chat = false');
    expect(sql).toContain('and temporary_chat');
    expect(sql).toContain('and deleted_at is null');
  });
});

describe('temporary-chat files and the gallery', () => {
  it('are never listed', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await listMediaAssets('user-1', {}, { query } as never);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('not temporary_chat');
  });

  it('are flagged from the conversation rather than from the caller', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'asset-1' }]);
    await insertMediaAsset(
      {
        userId: 'user-1',
        organizationId: null,
        kind: 'image',
        mimeType: 'image/png',
        storageUrl: 'https://example.test/a.png',
        conversationId: 'conversation-1',
      },
      { query },
    );
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('from public.web_conversations c');
    expect(sql).toContain('coalesce(c.is_temporary, false)');
  });
});
