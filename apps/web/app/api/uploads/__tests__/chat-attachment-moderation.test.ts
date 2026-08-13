/**
 * Hash matching at the upload completion boundary.
 *
 * `upload-scan` asks whether a file can *do* something dangerous when served.
 * Nothing asked what it *depicts*, so a known-illegal image registered and was
 * served like any other attachment. These cases pin the denylist hit: the
 * object is deleted from the private bucket, the asset is never registered, a
 * moderation report is emitted with the digest and list provenance, and the
 * uploader is told nothing that identifies the check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';

const {
  mockGetClerkAuthUser,
  mockGetPrivateObject,
  mockDeletePrivateObject,
  mockInsertMediaAsset,
  mockGetMediaAssetByStoragePathname,
  mockResolveActiveOrganizationId,
  loggerMock,
} = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockGetPrivateObject: vi.fn(),
  mockDeletePrivateObject: vi.fn(),
  mockInsertMediaAsset: vi.fn(),
  mockGetMediaAssetByStoragePathname: vi.fn(),
  mockResolveActiveOrganizationId: vi.fn(),
  loggerMock: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

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
  getPrivateObject: mockGetPrivateObject,
  deletePrivateObject: mockDeletePrivateObject,
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

/** A minimal but structurally valid PNG, so only the hash decides the verdict. */
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
  mockGetPrivateObject.mockResolvedValue({ data: PNG_BYTES, contentType: 'image/png' });
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
    expect(mockDeletePrivateObject).not.toHaveBeenCalled();
    expect(mockInsertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ storageUrl: STORAGE_KEY, storagePathname: STORAGE_KEY }),
    );
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
    // No oracle for the uploader: nothing names the denylist or the digest.
    expect(JSON.stringify(body)).not.toContain(PNG_DIGEST);
    expect(JSON.stringify(body)).not.toMatch(/hash|denylist|ncmec/i);
  });

  it('still registers attachments when no denylist is configured', async () => {
    delete process.env['MODERATION_HASH_DENYLIST'];

    const response = await POST(completeRequest());

    expect(response.status).toBe(200);
    expect(mockInsertMediaAsset).toHaveBeenCalledTimes(1);
  });
});
