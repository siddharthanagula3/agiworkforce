// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

type InfrastructureCostModule = typeof import('@/lib/services/infrastructure-cost');

vi.mock('@/lib/services/infrastructure-cost', async (importOriginal) => ({
  ...(await importOriginal<InfrastructureCostModule>()),
  recordGeneratedArtifactBytes: vi.fn(),
}));

import { createQueryDb } from '@/lib/server/chat-file-intake/__tests__/fake-query-db';
import { recordGeneratedArtifactBytes } from '@/lib/services/infrastructure-cost';
import {
  insertMediaAsset,
  insertScannedChatFileMediaAsset,
  listScannedChatFileAssets,
} from '../media-assets';

const INSERT_MEDIA_ASSET_SQL = `insert into public.media_assets
       (user_id, organization_id, kind, mime_type, byte_size, storage_url, storage_pathname,
        prompt, provider, model, width, height, source_surface, metadata,
        conversation_id, content_sha256, temporary_chat)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16,
       $17::boolean or exists (
         select 1 from public.web_conversations c
          where c.id = $15::uuid and coalesce(c.is_temporary, false)
       ))
     returning id`;

const SHA = 'b'.repeat(64);

describe('insertMediaAsset', () => {
  it('sends the statement every release has sent, naming no column 0422 adds', async () => {
    const { db, query } = createQueryDb(async () => [{ id: 'asset-1' }]);

    await insertMediaAsset(
      {
        userId: 'user-1',
        organizationId: null,
        kind: 'file',
        mimeType: 'application/pdf',
        storageUrl: 'chat-attachments/user-1/1_a.pdf.scanned',
        byteSize: 5,
        contentSha256: SHA,
      },
      db,
    );

    const [sql] = query.mock.calls[0]!;
    expect(sql).toBe(INSERT_MEDIA_ASSET_SQL);
    expect(sql).not.toMatch(/scanned_sha256/);
  });
});

describe('insertScannedChatFileMediaAsset', () => {
  it('names scanned_sha256 and binds it and the content hash from the one verdict hash', async () => {
    const { db, query } = createQueryDb(async () => [{ id: 'asset-2' }]);

    const id = await insertScannedChatFileMediaAsset(
      {
        userId: 'user-1',
        organizationId: null,
        kind: 'file',
        mimeType: 'application/pdf',
        byteSize: 400 * 1024 * 1024,
        storagePathname: 'chat-attachments/user-1/1_a.pdf.scanned',
        conversationId: null,
        temporaryChat: false,
        scannedSha256: SHA,
        metadata: { source: 'chat-attachment' },
      },
      db,
    );

    expect(id).toBe('asset-2');
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/content_sha256, scanned_sha256/);
    expect(sql).toMatch(/\$9, \$9,/);
    expect((params as unknown[])[8]).toBe(SHA);
    expect(sql).not.toBe(INSERT_MEDIA_ASSET_SQL);
  });

  it('lets the conversation, read under a share lock, decide whether a file in it is temporary', async () => {
    const { db, query } = createQueryDb(async () => [{ id: 'asset-4' }]);

    await insertScannedChatFileMediaAsset(
      {
        userId: 'user-1',
        organizationId: null,
        kind: 'file',
        mimeType: 'application/pdf',
        byteSize: 400 * 1024 * 1024,
        storagePathname: 'chat-attachments/user-1/1_a.pdf.scanned',
        conversationId: '6c1f0a52-3b7e-4d2a-9f10-1a2b3c4d5e02',
        temporaryChat: true,
        scannedSha256: SHA,
        metadata: { source: 'chat-attachment' },
      },
      db,
    );

    const [sql] = query.mock.calls[0]!;
    const flat = String(sql).replace(/\s+/g, ' ');
    expect(flat).toContain('case when $8::uuid is null then $10::boolean else exists (');
    expect(flat).toContain('coalesce(c.is_temporary, false) for share of c ) end');
    expect(flat).not.toContain('$10::boolean or exists');
  });

  it('records no stored bytes itself, since the seal’s transaction may still roll it back', async () => {
    vi.mocked(recordGeneratedArtifactBytes).mockClear();
    const { db } = createQueryDb(async () => [{ id: 'asset-3' }]);

    await insertScannedChatFileMediaAsset(
      {
        userId: 'user-1',
        organizationId: null,
        kind: 'file',
        mimeType: 'application/pdf',
        byteSize: 400 * 1024 * 1024,
        storagePathname: 'chat-attachments/user-1/1_a.pdf.scanned',
        conversationId: null,
        temporaryChat: false,
        scannedSha256: SHA,
        metadata: {},
      },
      db,
    );

    expect(recordGeneratedArtifactBytes).not.toHaveBeenCalled();
  });

  it('throws when the insert returns no identity', async () => {
    const { db } = createQueryDb(async () => []);
    await expect(
      insertScannedChatFileMediaAsset(
        {
          userId: 'user-1',
          organizationId: null,
          kind: 'file',
          mimeType: 'application/pdf',
          byteSize: 1,
          storagePathname: 'k',
          conversationId: null,
          temporaryChat: false,
          scannedSha256: SHA,
          metadata: {},
        },
        db,
      ),
    ).rejects.toThrow(/no identity/);
  });
});

describe('listScannedChatFileAssets', () => {
  const OWNER = { userId: 'user-1', organizationId: null };
  const CHAT_FILE = { source: 'chat-attachment', keyPrefix: 'chat-attachments/' };
  const ASSET_ID = '11111111-1111-4111-8111-111111111111';

  it('asks with the owner and requires the scan verdict to equal the content hash', async () => {
    const { db, query } = createQueryDb(async () => []);

    await listScannedChatFileAssets(OWNER, [ASSET_ID, ASSET_ID], CHAT_FILE, db);

    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('and user_id = $2');
    expect(sql).toContain('and organization_id is not distinct from $3::uuid');
    expect(sql).toContain('and deleted_at is null');
    expect(sql).toContain('and scanned_sha256 = content_sha256');
    expect(params).toEqual([[ASSET_ID], 'user-1', null, 'chat-attachment', 'chat-attachments/']);
  });

  it('returns only rows whose scan verdict matched', async () => {
    const row = {
      mime_type: 'text/csv',
      byte_size: '30000000',
      storage_pathname: 'chat-attachments/user-1/a.csv',
      file_name: 'a.csv',
      source: 'chat-attachment',
    };
    const { db } = createQueryDb(async () => [
      { ...row, id: 'scanned', scan_verified: true },
      { ...row, id: 'changed', scan_verified: false },
      { ...row, id: 'unscanned', scan_verified: null },
    ]);

    const rows = await listScannedChatFileAssets(
      OWNER,
      ['scanned', 'changed', 'unscanned'],
      CHAT_FILE,
      db,
    );

    expect(rows).toEqual([
      {
        id: 'scanned',
        mimeType: 'text/csv',
        byteSize: 30_000_000,
        storagePathname: 'chat-attachments/user-1/a.csv',
        filename: 'a.csv',
        source: 'chat-attachment',
      },
    ]);
  });

  it('sends nothing for no ids', async () => {
    const { db, query } = createQueryDb(async () => []);

    expect(await listScannedChatFileAssets(OWNER, [], CHAT_FILE, db)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
