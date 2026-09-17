import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockGetBoundedPrivateObject,
  mockCopyPrivateObjectIfUnchanged,
  mockDeletePrivateObject,
  mockInsertMediaAsset,
  mockGetMediaAssetByStoragePathname,
  mockGetMediaAssetByContentHash,
  loggerMock,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockGetBoundedPrivateObject: vi.fn(),
  mockCopyPrivateObjectIfUnchanged: vi.fn(),
  mockDeletePrivateObject: vi.fn(),
  mockInsertMediaAsset: vi.fn(),
  mockGetMediaAssetByStoragePathname: vi.fn(),
  mockGetMediaAssetByContentHash: vi.fn(),
  loggerMock: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/object-storage', () => ({
  isPrivateObjectStorageConfigured: vi.fn(() => true),
  getBoundedPrivateObject: mockGetBoundedPrivateObject,
  copyPrivateObjectIfUnchanged: mockCopyPrivateObjectIfUnchanged,
  deletePrivateObject: mockDeletePrivateObject,
  StoredObjectTooLargeError: class extends Error {},
  deleteObject: vi.fn(),
  getObject: vi.fn(),
  getObjectStream: vi.fn(),
  getPrivateObject: vi.fn(),
  getPrivateObjectStream: vi.fn(),
  isObjectStorageConfigured: vi.fn(() => true),
  putPrivateObject: vi.fn(),
}));
vi.mock('@/lib/server/media-assets', () => ({
  insertMediaAsset: mockInsertMediaAsset,
  getMediaAssetByStoragePathname: mockGetMediaAssetByStoragePathname,
  getMediaAssetByContentHash: mockGetMediaAssetByContentHash,
}));

import { POST } from '@/app/api/uploads/chat-attachment/complete/route';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const STORAGE_KEY = 'chat-attachments/user-abc/1700000000000_abcdefghijklm.png';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';

const SCOPED_DB = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };

function completeRequest(extra: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/uploads/chat-attachment/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storageKey: STORAGE_KEY,
      fileName: 'photo.png',
      mimeType: 'image/png',
      byteCount: PNG_BYTES.byteLength,
      ...extra,
    }),
  });
}

function insertedTemporaryFlag(): boolean | undefined {
  return (mockInsertMediaAsset.mock.calls[0]?.[0] as { temporaryChat?: boolean } | undefined)
    ?.temporaryChat;
}

beforeEach(() => {
  vi.clearAllMocks();
  SCOPED_DB.query.mockResolvedValue([]);
  mockGetUserScopedDb.mockResolvedValue({
    db: SCOPED_DB,
    userId: 'user-abc',
    organizationId: null,
  });
  mockGetMediaAssetByStoragePathname.mockResolvedValue(null);
  mockGetMediaAssetByContentHash.mockResolvedValue(null);
  mockGetBoundedPrivateObject.mockResolvedValue({
    data: PNG_BYTES,
    contentType: 'image/png',
    etag: '"etag-1"',
  });
  mockCopyPrivateObjectIfUnchanged.mockResolvedValue(true);
  mockInsertMediaAsset.mockResolvedValue('asset-1');
  mockDeletePrivateObject.mockResolvedValue(undefined);
});

describe('POST /api/uploads/chat-attachment/complete · Temporary Chat file policy', () => {
  it('keeps an ordinary upload in the Library', async () => {
    const response = await POST(completeRequest({}));

    expect(response.status).toBe(200);
    expect(insertedTemporaryFlag()).toBe(false);
  });

  it('marks an upload the conversation itself says is temporary', async () => {
    SCOPED_DB.query.mockResolvedValue([{ is_temporary: true }]);

    const response = await POST(completeRequest({ conversationId: CONVERSATION }));

    expect(response.status).toBe(200);
    expect(insertedTemporaryFlag()).toBe(true);
    const [sql, params] = SCOPED_DB.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/is_temporary/);
    expect(params).toEqual([CONVERSATION, 'user-abc']);
  });

  it('believes the conversation over a client that claims otherwise', async () => {
    SCOPED_DB.query.mockResolvedValue([{ is_temporary: false }]);

    await POST(completeRequest({ conversationId: CONVERSATION, temporary: true }));

    expect(insertedTemporaryFlag()).toBe(false);
  });

  it('honours the declared flag for a chat that has no row yet', async () => {
    await POST(completeRequest({ temporary: true }));

    expect(insertedTemporaryFlag()).toBe(true);
    expect(SCOPED_DB.query).not.toHaveBeenCalled();
  });

  it('never reuses a kept file for a temporary chat, nor the other way round', async () => {
    await POST(completeRequest({ temporary: true }));

    expect(mockGetMediaAssetByStoragePathname.mock.calls[0]?.[4]).toBe(true);
    expect(mockGetMediaAssetByContentHash.mock.calls[0]?.[4]).toBe(true);
  });
});
