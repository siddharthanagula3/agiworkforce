import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  insertMediaAsset: vi.fn(),
  getMediaAssetByStoragePathname: vi.fn(),
  getMediaAssetByContentHash: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
}));

vi.mock('@/lib/server/object-storage', () => ({
  deletePrivateObject: vi.fn(async () => undefined),
  putPrivateObject: vi.fn(async () => undefined),
  getBoundedPrivateObject: mocks.getBoundedPrivateObject,
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
}));
vi.mock('@/lib/server/media-assets', () => ({
  insertMediaAsset: mocks.insertMediaAsset,
  getMediaAssetByStoragePathname: mocks.getMediaAssetByStoragePathname,
  getMediaAssetByContentHash: mocks.getMediaAssetByContentHash,
}));
vi.mock('@/lib/server/media-storage', () => ({
  sealedChatAttachmentPathname: (key: string) => `${key}.sealed`,
}));
vi.mock('@/lib/server/file-storage', () => ({ assertFileStorageAvailable: vi.fn() }));
vi.mock('@/lib/server/product-analytics', () => ({ trackProductAnalyticsEvent: vi.fn() }));
vi.mock('@/lib/server/upload-signing', () => ({
  readSignedUploadClaims: vi.fn(),
  signUploadClaims: vi.fn(),
}));
vi.mock('@/lib/security/upload-scan', () => ({
  scanUploadBytes: vi.fn(async () => ({ ok: true, findings: [] })),
  uploadFindingRejects: vi.fn(() => false),
  uploadRefusalMessage: vi.fn(() => 'refused'),
}));
vi.mock('@/lib/security/outbound-content-inspection', () => ({
  inspectOutboundContent: vi.fn(async () => ({ action: 'allowed' })),
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveSecretHandlingPolicy: vi.fn(async () => ({ mode: 'allow' })),
}));
vi.mock('@/lib/moderation', () => ({
  matchDenylistedUpload: vi.fn(() => ({ matched: false, sha256: 'a'.repeat(64) })),
  recordModerationEvent: vi.fn(),
}));

import { completeChatAttachmentUpload } from './chat-attachment-completion';

const USER_ID = 'user-1';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

function dbReturning(rows: Record<string, unknown>[]): {
  db: DatabaseAdapter;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async () => rows);
  return { db: { query } as unknown as DatabaseAdapter, query };
}

function complete(db: DatabaseAdapter, conversationId?: string) {
  return completeChatAttachmentUpload({
    db,
    userId: USER_ID,
    organizationId: null,
    sourceSurface: 'web',
    analyticsSurface: 'web',
    storageKey: `chat-attachments/${USER_ID}/notes.txt`,
    fileName: 'notes.txt',
    mimeType: 'text/plain',
    byteCount: 5,
    ...(conversationId ? { conversationId } : {}),
  });
}

function insertedParams(): Record<string, unknown> {
  return mocks.insertMediaAsset.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBoundedPrivateObject.mockResolvedValue({
    data: Buffer.from('hello'),
    contentType: 'text/plain',
    etag: 'etag-1',
  });
  mocks.getMediaAssetByStoragePathname.mockResolvedValue(null);
  mocks.getMediaAssetByContentHash.mockResolvedValue(null);
  mocks.insertMediaAsset.mockResolvedValue('asset-1');
});

describe('completeChatAttachmentUpload conversation provenance', () => {
  it('records the owned conversation the file was uploaded into', async () => {
    const { db } = dbReturning([{ id: CONVERSATION_ID, is_temporary: false }]);

    await complete(db, CONVERSATION_ID);

    expect(insertedParams()).toMatchObject({
      conversationId: CONVERSATION_ID,
      temporaryChat: false,
    });
  });

  it('records the conversation of a temporary chat and keeps the file temporary', async () => {
    const { db } = dbReturning([{ id: CONVERSATION_ID, is_temporary: true }]);

    await complete(db, CONVERSATION_ID);

    expect(insertedParams()).toMatchObject({
      conversationId: CONVERSATION_ID,
      temporaryChat: true,
    });
  });

  it('records no conversation that the account does not own', async () => {
    const { db } = dbReturning([]);

    await complete(db, CONVERSATION_ID);

    expect(insertedParams()).not.toHaveProperty('conversationId');
  });

  it('refuses the upload when the lookup fails rather than registering a kept file', async () => {
    const db = {
      query: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    } as unknown as DatabaseAdapter;

    await expect(complete(db, CONVERSATION_ID)).rejects.toMatchObject({ statusCode: 503 });

    expect(mocks.insertMediaAsset).not.toHaveBeenCalled();
    expect(mocks.getMediaAssetByContentHash).not.toHaveBeenCalled();
  });

  it('keeps the declared temporary flag when the owned conversation is not found', async () => {
    const { db } = dbReturning([]);

    await completeChatAttachmentUpload({
      db,
      userId: USER_ID,
      organizationId: null,
      sourceSurface: 'web',
      analyticsSurface: 'web',
      storageKey: `chat-attachments/${USER_ID}/notes.txt`,
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      byteCount: 5,
      conversationId: CONVERSATION_ID,
      temporary: true,
    });

    expect(insertedParams()).toMatchObject({ temporaryChat: true });
    expect(insertedParams()).not.toHaveProperty('conversationId');
  });

  it('records no conversation for an upload made before a chat exists', async () => {
    const { db, query } = dbReturning([]);

    await complete(db);

    expect(query).not.toHaveBeenCalled();
    expect(insertedParams()).not.toHaveProperty('conversationId');
  });
});
