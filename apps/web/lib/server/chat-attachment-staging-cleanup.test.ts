import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const { mockDeletePrivateObject, mockGetMediaAssetByStoragePathname } = vi.hoisted(() => ({
  mockDeletePrivateObject: vi.fn(),
  mockGetMediaAssetByStoragePathname: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule9>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/object-storage', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule8>()),
  deletePrivateObject: mockDeletePrivateObject,
  putPrivateObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  StoredObjectTooLargeError: class extends Error {},
}));
vi.mock('@/lib/server/media-assets', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule7>()),
  getMediaAssetByStoragePathname: mockGetMediaAssetByStoragePathname,
  getMediaAssetByContentHash: vi.fn(),
  insertMediaAsset: vi.fn(),
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule6>()),
  sealedChatAttachmentPathname: (key: string) => `${key}.scanned`,
}));
vi.mock('@/lib/server/file-storage', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule5>()),
  assertFileStorageAvailable: vi.fn(),
}));
vi.mock('@/lib/server/product-analytics', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule4>()),
  trackProductAnalyticsEvent: vi.fn(),
}));
vi.mock('@/lib/server/upload-signing', () => ({
  readSignedUploadClaims: vi.fn(),
  signUploadClaims: vi.fn(),
}));
vi.mock('@/lib/security/upload-scan', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  scanUploadBytes: vi.fn(),
  uploadFindingRejects: vi.fn(),
  uploadRefusalMessage: vi.fn(),
}));
vi.mock('@/lib/security/outbound-content-inspection', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  inspectOutboundContent: vi.fn(),
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  resolveSecretHandlingPolicy: vi.fn(),
}));
vi.mock('@/lib/moderation', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  matchDenylistedUpload: vi.fn(),
  recordModerationEvent: vi.fn(),
}));

import { findCompletedChatAttachment } from './chat-attachment-completion';

const STORAGE_KEY = 'chat-attachments/user-abc/1700000000000_abcdefghijklm.png';
const SEALED_KEY = `${STORAGE_KEY}.scanned`;

const asset = { id: 'asset-1', mimeType: 'image/png', byteSize: 16, metadata: {} };

function registeredAt(pathname: string) {
  mockGetMediaAssetByStoragePathname.mockImplementation(async (_user: string, requested: string) =>
    requested === pathname ? asset : null,
  );
}

function lookup() {
  return findCompletedChatAttachment({
    db: {} as DatabaseAdapter,
    userId: 'user-abc',
    organizationId: null,
    storageKey: STORAGE_KEY,
    fileName: 'photo.png',
    byteCount: 16,
    temporaryChat: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDeletePrivateObject.mockResolvedValue(undefined);
});

describe('findCompletedChatAttachment staging cleanup', () => {
  it('retries the staging deletion when a replay finds the sealed attachment', async () => {
    registeredAt(SEALED_KEY);

    await expect(lookup()).resolves.toMatchObject({ id: 'asset-1', url: '/api/files/asset-1' });

    expect(mockDeletePrivateObject).toHaveBeenCalledTimes(1);
    expect(mockDeletePrivateObject).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('still reports the attachment when the staging deletion fails again', async () => {
    registeredAt(SEALED_KEY);
    mockDeletePrivateObject.mockRejectedValue(new Error('storage unavailable'));

    await expect(lookup()).resolves.toMatchObject({ id: 'asset-1' });
  });

  it('never deletes the object of an attachment registered under the unsealed key', async () => {
    registeredAt(STORAGE_KEY);

    await expect(lookup()).resolves.toMatchObject({ id: 'asset-1' });

    expect(mockDeletePrivateObject).not.toHaveBeenCalled();
  });

  it('deletes nothing when no attachment was completed', async () => {
    mockGetMediaAssetByStoragePathname.mockResolvedValue(null);

    await expect(lookup()).resolves.toBeNull();

    expect(mockDeletePrivateObject).not.toHaveBeenCalled();
  });
});

type ImportedModule9 = typeof import('@/lib/logger');
type ImportedModule8 = typeof import('@/lib/server/object-storage');
type ImportedModule7 = typeof import('@/lib/server/media-assets');
type ImportedModule6 = typeof import('@/lib/server/media-storage');
type ImportedModule5 = typeof import('@/lib/server/file-storage');
type ImportedModule4 = typeof import('@/lib/server/product-analytics');
type ImportedModule3 = typeof import('@/lib/security/upload-scan');
type ImportedModule2 = typeof import('@/lib/security/outbound-content-inspection');
type ImportedModule1 = typeof import('@/lib/services/organization-policy-gate');
type ImportedModule0 = typeof import('@/lib/moderation');
