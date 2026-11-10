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

function transactional(query: ReturnType<typeof vi.fn>) {
  return { query, transaction: async (run: (tx: unknown) => unknown) => run({ query }) } as never;
}

describe('purgeTemporaryChatFiles', () => {
  it('deletes the stored bytes and the row for a temporary-chat file past the window', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([
        { id: 'asset-1', storage_pathname: 'temp/asset-1.png', organization_id: null },
      ])
      .mockResolvedValueOnce([{ id: 'asset-1', storage_pathname: 'temp/asset-1.png' }])
      .mockResolvedValueOnce([{ id: 'asset-1', user_id: 'user-1' }])
      .mockResolvedValue([]);

    const result = await purgeTemporaryChatFiles(transactional(query), { nowMs: NOW_MS });

    const [selectSql, selectParams] = query.mock.calls[1] as [string, unknown[]];
    expect(selectSql).toContain('candidate.temporary_chat');
    expect(selectSql).toContain('legal_hold_custodians');
    expect(selectParams[0]).toBe(temporaryFileCutoff(NOW_MS).toISOString());
    expect(deleteStoredMediaObjects).toHaveBeenCalledWith(['temp/asset-1.png']);
    const [deleteSql, deleteParams] = query.mock.calls[3] as [string, unknown[]];
    expect(deleteSql).toContain('delete from public.media_assets');
    expect(deleteSql).toContain('target.temporary_chat');
    expect(deleteParams[0]).toEqual(['asset-1']);
    expect(result).toMatchObject({ candidates: 1, purged: 1, objectsFailed: 0 });
  });

  it('locks the rows and re-reads the flag before any byte is deleted', async () => {
    const events: string[] = [];
    deleteStoredMediaObjects.mockImplementation(async () => {
      events.push('bytes');
      return { deleted: 1, failedPathnames: [] };
    });
    const query = vi.fn(async (sql: string) => {
      if (/for update of candidate/.test(sql)) {
        events.push('lock');
        return [{ id: 'asset-1', storage_pathname: 'temp/asset-1.png' }];
      }
      if (/delete from public\.media_assets/.test(sql)) {
        events.push('delete');
        return [{ id: 'asset-1', user_id: 'user-1' }];
      }
      if (/select candidate\.id/.test(sql)) {
        return [{ id: 'asset-1', storage_pathname: 'temp/asset-1.png', organization_id: null }];
      }
      return [{ count: 0 }];
    });

    await purgeTemporaryChatFiles(transactional(query as never), { nowMs: NOW_MS });

    expect(events).toEqual(['lock', 'bytes', 'delete']);
    const locking = query.mock.calls.find(([sql]) => /for update of candidate/.test(sql)) as [
      string,
      unknown[],
    ];
    expect(locking[0]).toContain('candidate.temporary_chat');
    expect(locking[0]).toContain('candidate.created_at < $2::timestamptz');
    expect(locking[1][1]).toBe(temporaryFileCutoff(NOW_MS).toISOString());
  });

  it('keeps the bytes and the row of a file saved to the Library after it was selected', async () => {
    const query = vi.fn(async (sql: string) => {
      if (/for update of candidate/.test(sql)) return [];
      if (/select candidate\.id/.test(sql)) {
        return [{ id: 'asset-1', storage_pathname: 'temp/asset-1.png', organization_id: null }];
      }
      return [{ count: 0 }];
    });

    const result = await purgeTemporaryChatFiles(transactional(query as never), {
      nowMs: NOW_MS,
    });

    expect(deleteStoredMediaObjects).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => /delete from public\.media_assets/.test(sql))).toBe(
      false,
    );
    expect(result).toMatchObject({ candidates: 1, purged: 0 });
  });

  it('leaves the row when storage still holds the bytes', async () => {
    deleteStoredMediaObjects.mockResolvedValue({
      deleted: 0,
      failedPathnames: ['temp/asset-1.png'],
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([
        { id: 'asset-1', storage_pathname: 'temp/asset-1.png', organization_id: null },
      ])
      .mockResolvedValueOnce([{ id: 'asset-1', storage_pathname: 'temp/asset-1.png' }]);

    const result = await purgeTemporaryChatFiles(transactional(query), { nowMs: NOW_MS });

    // The hold count, the candidate read and the locked re-read, and no delete.
    expect(query).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ purged: 0, objectsFailed: 1 });
  });

  it('takes the workspace destruction lock before reading the hold set', async () => {
    const ORG = '11111111-1111-4111-8111-111111111111';
    const query = vi.fn(async (sql: string) => {
      if (/for update of candidate/.test(sql)) return [];
      if (/select candidate\.id/.test(sql)) {
        return [{ id: 'asset-1', storage_pathname: null, organization_id: ORG }];
      }
      return [{ count: 0 }];
    });

    await purgeTemporaryChatFiles(transactional(query as never), { nowMs: NOW_MS });

    const statements = query.mock.calls.map(([sql]) => sql);
    const lockAt = statements.findIndex((sql) => /pg_advisory_xact_lock_shared/.test(sql));
    const confirmAt = statements.findIndex((sql) => /for update of candidate/.test(sql));
    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(confirmAt);
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
