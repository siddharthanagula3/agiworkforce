import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

const {
  mockGetClerkAuthUser,
  mockGetBoundedPrivateObject,
  mockCopyPrivateObjectIfUnchanged,
  mockDeletePrivateObject,
  mockInsertMediaAsset,
  mockGetMediaAssetByStoragePathname,
  mockResolveActiveOrganizationId,
  loggerMock,
  StoredObjectTooLargeError,
} = vi.hoisted(() => {
  class StoredObjectTooLargeError extends Error {
    constructor(
      readonly key: string,
      readonly maxBytes: number,
      readonly contentLength?: number,
    ) {
      super(`Stored object exceeds the permitted ${maxBytes} bytes`);
      this.name = 'StoredObjectTooLargeError';
    }
  }
  return {
    mockGetClerkAuthUser: vi.fn(),
    mockGetBoundedPrivateObject: vi.fn(),
    mockCopyPrivateObjectIfUnchanged: vi.fn(),
    mockDeletePrivateObject: vi.fn(),
    mockInsertMediaAsset: vi.fn(),
    mockGetMediaAssetByStoragePathname: vi.fn(),
    mockResolveActiveOrganizationId: vi.fn(),
    loggerMock: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    StoredObjectTooLargeError,
  };
});

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
  getAuthenticatedUserWithClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));
vi.mock('@/lib/server/object-storage', () => ({
  isPrivateObjectStorageConfigured: vi.fn(() => true),
  getBoundedPrivateObject: mockGetBoundedPrivateObject,
  copyPrivateObjectIfUnchanged: mockCopyPrivateObjectIfUnchanged,
  deletePrivateObject: mockDeletePrivateObject,
  StoredObjectTooLargeError,
}));
vi.mock('@/lib/server/media-assets', () => ({
  insertMediaAsset: mockInsertMediaAsset,
  getMediaAssetByStoragePathname: mockGetMediaAssetByStoragePathname,
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mockResolveActiveOrganizationId,
}));

import { POST } from '@/app/api/uploads/chat-attachment/complete/route';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const PNG_DIGEST = createHash('sha256').update(PNG_BYTES).digest('hex');
const STORAGE_KEY = 'chat-attachments/user-abc/1700000000000_abcdefghijklm.png';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

const savedList = process.env['MODERATION_HASH_DENYLIST'];

function completeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/uploads/chat-attachment/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storageKey: STORAGE_KEY,
      fileName: 'photo.png',
      mimeType: 'image/png',
      byteCount: PNG_BYTES.byteLength,
    }),
  });
}

beforeEach(() => {
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mockResolveActiveOrganizationId.mockResolvedValue(ORGANIZATION_ID);
  mockGetMediaAssetByStoragePathname.mockResolvedValue(null);
  mockGetBoundedPrivateObject.mockResolvedValue({
    data: PNG_BYTES,
    contentType: 'image/png',
    etag: '"etag-1"',
  });
  mockCopyPrivateObjectIfUnchanged.mockResolvedValue(true);
  mockInsertMediaAsset.mockResolvedValue('asset-1');
  mockDeletePrivateObject.mockResolvedValue(undefined);
  loggerMock.error.mockClear();
});

afterEach(() => {
  if (savedList === undefined) delete process.env['MODERATION_HASH_DENYLIST'];
  else process.env['MODERATION_HASH_DENYLIST'] = savedList;
});

describe('POST /api/uploads/chat-attachment/complete · hash denylist', () => {
  it('registers an attachment whose digest is not on the list', async () => {
    process.env['MODERATION_HASH_DENYLIST'] = 'a'.repeat(64);

    const response = await POST(completeRequest());

    expect(response.status).toBe(200);
    expect(mockInsertMediaAsset).toHaveBeenCalledTimes(1);
    expect(mockGetMediaAssetByStoragePathname).toHaveBeenCalledWith(
      'user-abc',
      STORAGE_KEY,
      ORGANIZATION_ID,
    );
    expect(mockInsertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );
    expect(mockInsertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        storageUrl: `${STORAGE_KEY}.scanned`,
        storagePathname: `${STORAGE_KEY}.scanned`,
      }),
    );
    expect(mockCopyPrivateObjectIfUnchanged).toHaveBeenCalledWith({
      sourceKey: STORAGE_KEY,
      destinationKey: `${STORAGE_KEY}.scanned`,
      etag: '"etag-1"',
    });
    expect(mockDeletePrivateObject).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('rejects an upload whose bytes changed between the scan and the seal', async () => {
    mockCopyPrivateObjectIfUnchanged.mockResolvedValue(false);

    const response = await POST(completeRequest());

    expect(response.status).toBe(400);
    expect(mockInsertMediaAsset).not.toHaveBeenCalled();
    expect(mockDeletePrivateObject).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('never registers an object it could not pin to an ETag', async () => {
    mockGetBoundedPrivateObject.mockResolvedValue({ data: PNG_BYTES, contentType: 'image/png' });

    const response = await POST(completeRequest());

    expect(response.status).toBe(400);
    expect(mockCopyPrivateObjectIfUnchanged).not.toHaveBeenCalled();
    expect(mockInsertMediaAsset).not.toHaveBeenCalled();
  });

  it('rejects, deletes, and reports an attachment whose digest is on the list', async () => {
    process.env['MODERATION_HASH_DENYLIST'] = `ncmec:${PNG_DIGEST}`;

    const response = await POST(completeRequest());
    const body = (await response.json()) as { error?: { message?: string } };

    expect(response.status).toBe(400);
    expect(mockInsertMediaAsset).not.toHaveBeenCalled();
    expect(mockDeletePrivateObject).toHaveBeenCalledWith(STORAGE_KEY);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'upload',
        action: 'block',
        contentSha256: PNG_DIGEST,
        listLabel: 'ncmec',
        storageKey: STORAGE_KEY,
        userId: 'user-abc',
      }),
      expect.stringContaining('[moderation]'),
    );
    expect(JSON.stringify(body)).not.toContain(PNG_DIGEST);
    expect(JSON.stringify(body)).not.toMatch(/hash|denylist|ncmec/i);
  });

  it('reads the stored object under the declared byte count rather than unbounded', async () => {
    await POST(completeRequest());

    expect(mockGetBoundedPrivateObject).toHaveBeenCalledWith(STORAGE_KEY, PNG_BYTES.byteLength);
  });

  it('rejects and purges an object that outgrew the size the user declared', async () => {
    mockGetBoundedPrivateObject.mockRejectedValue(
      new StoredObjectTooLargeError(STORAGE_KEY, PNG_BYTES.byteLength, 4 * 1024 * 1024 * 1024),
    );

    const response = await POST(completeRequest());

    expect(response.status).toBe(400);
    expect(mockInsertMediaAsset).not.toHaveBeenCalled();
    expect(mockDeletePrivateObject).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('still registers attachments when no denylist is configured', async () => {
    delete process.env['MODERATION_HASH_DENYLIST'];

    const response = await POST(completeRequest());

    expect(response.status).toBe(200);
    expect(mockInsertMediaAsset).toHaveBeenCalledTimes(1);
  });
});
