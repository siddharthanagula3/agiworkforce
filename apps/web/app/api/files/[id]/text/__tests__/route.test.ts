import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { StoredObjectTooLargeError } from '@/lib/server/object-storage';
import { renderFileTextPreview } from '@/lib/server/file-text-preview';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/file-text-preview', async (importOriginal) => {
  const actual = await importOriginal<ImportedModule0>();
  return { ...actual, renderFileTextPreview: vi.fn(actual.renderFileTextPreview) };
});

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  getActiveWorkspaceMediaAssetById: vi.fn(),
  isMediaStorageConfigured: vi.fn(),
  readStoredMedia: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/media-assets', () => ({
  TEMPORARY_CHAT_RETENTION_DAYS: vi.fn(),
  TEMPORARY_FILE_RETENTION_CLAIM: vi.fn(),
  TemporaryChatFilePurge: vi.fn(),
  deleteVideoMediaAsset: vi.fn(),
  getMediaAssetByContentHash: vi.fn(),
  getMediaAssetById: vi.fn(),
  getMediaAssetByStoragePathname: vi.fn(),
  insertMediaAsset: vi.fn(),
  insertMediaAssetsAtomically: vi.fn(),
  latestConversationImageAssetId: vi.fn(),
  listLibraryAssets: vi.fn(),
  listMediaAssets: vi.fn(),
  permanentlyDeleteMediaAsset: vi.fn(),
  purgeTemporaryChatFiles: vi.fn(),
  restoreMediaAsset: vi.fn(),
  saveTemporaryChatAssetToLibrary: vi.fn(),
  softDeleteMediaAsset: vi.fn(),
  upsertVideoMediaAsset: vi.fn(),
  getActiveWorkspaceMediaAssetById: mocks.getActiveWorkspaceMediaAssetById,
}));
vi.mock('@/lib/server/media-storage', () => ({
  authenticatedMediaUrl: vi.fn(),
  bytesFromBase64: vi.fn(),
  bytesFromUrl: vi.fn(),
  deleteStoredMedia: vi.fn(),
  deleteStoredMediaObjects: vi.fn(),
  extForMime: vi.fn(),
  isGeneratedMediaStorageConfigured: vi.fn(),
  isImageStorageConfigured: vi.fn(),
  isVideoStorageConfigured: vi.fn(),
  sealedChatAttachmentPathname: vi.fn(),
  storeMedia: vi.fn(),
  storeMediaFile: vi.fn(),
  streamStoredMedia: vi.fn(),
  videoStoragePathname: vi.fn(),
  isMediaStorageConfigured: mocks.isMediaStorageConfigured,
  readStoredMedia: mocks.readStoredMedia,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const FILE_ID = '66666666-6666-4666-8666-666666666666';
const MAX_TEXT_SOURCE_BYTES = 30 * 1024 * 1024;
const db = { query: vi.fn() };

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/files/${FILE_ID}/text`);
}

function context(id = FILE_ID) {
  return { params: Promise.resolve({ id }) };
}

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: FILE_ID,
    kind: 'document',
    mimeType: 'text/plain',
    byteSize: 12,
    storagePathname: 'users/user-1/notes.txt',
    deletedAt: null,
    metadata: { filename: 'notes.txt' },
    ...overrides,
  };
}

describe('/api/files/[id]/text', () => {
  it('passes the admitted organization to the reader', async () => {
    mocks.getUserScopedDb.mockResolvedValue({
      db,
      userId: 'user-1',
      organizationId: 'workspace-A',
    });
    mocks.getActiveWorkspaceMediaAssetById.mockResolvedValue(null);
    await GET(request(), context());
    expect(mocks.getActiveWorkspaceMediaAssetById).toHaveBeenCalledWith('user-1', FILE_ID, db, {
      organizationId: 'workspace-A',
    });
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.isMediaStorageConfigured.mockReturnValue(true);
    mocks.getActiveWorkspaceMediaAssetById.mockResolvedValue(asset());
    mocks.readStoredMedia.mockResolvedValue({
      data: Buffer.from('hello world\n'),
      contentType: 'text/plain',
    });
  });

  it('returns the rate limit response before resolving the caller', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request(), context());
    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.getActiveWorkspaceMediaAssetById).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is not a uuid', async () => {
    const response = await GET(request(), context('../etc/passwd'));
    expect(response.status).toBe(404);
    expect(mocks.getActiveWorkspaceMediaAssetById).not.toHaveBeenCalled();
  });

  it('answers 404 for a file the caller cannot see', async () => {
    mocks.getActiveWorkspaceMediaAssetById.mockResolvedValue(null);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
  });

  it('answers 404 for a deleted file', async () => {
    mocks.getActiveWorkspaceMediaAssetById.mockResolvedValue(
      asset({ deletedAt: '2026-09-01T00:00:00.000Z' }),
    );
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
  });

  it('answers 404 for a file type with no text preview', async () => {
    mocks.getActiveWorkspaceMediaAssetById.mockResolvedValue(
      asset({ mimeType: 'image/png', metadata: { filename: 'photo.png' } }),
    );
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
  });

  it('refuses a file larger than the preview limit', async () => {
    mocks.getActiveWorkspaceMediaAssetById.mockResolvedValue(asset({ byteSize: 31 * 1024 * 1024 }));
    const response = await GET(request(), context());
    expect(response.status).toBe(400);
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
  });

  it('answers 404 when storage is not configured', async () => {
    mocks.isMediaStorageConfigured.mockReturnValue(false);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.readStoredMedia).not.toHaveBeenCalled();
  });

  it.each([null, 12])('bounds stored bytes when asset byteSize is %s', async (byteSize) => {
    mocks.getActiveWorkspaceMediaAssetById.mockResolvedValue(asset({ byteSize }));
    mocks.readStoredMedia.mockRejectedValueOnce(
      new StoredObjectTooLargeError(
        'users/user-1/notes.txt',
        MAX_TEXT_SOURCE_BYTES,
        MAX_TEXT_SOURCE_BYTES + 1,
      ),
    );
    const response = await GET(request(), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'This file is too large to preview' },
    });
    expect(mocks.readStoredMedia).toHaveBeenCalledWith(
      'users/user-1/notes.txt',
      MAX_TEXT_SOURCE_BYTES,
    );
    expect(renderFileTextPreview).not.toHaveBeenCalled();
  });

  it('refuses an unknown remote length or streaming overflow without claiming a known size', async () => {
    mocks.getActiveWorkspaceMediaAssetById.mockResolvedValue(asset({ byteSize: null }));
    mocks.readStoredMedia.mockRejectedValueOnce(
      new StoredObjectTooLargeError('users/user-1/notes.txt', MAX_TEXT_SOURCE_BYTES),
    );
    const response = await GET(request(), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'This file could not be read within the preview size limit',
      },
    });
    expect(mocks.readStoredMedia).toHaveBeenCalledWith(
      'users/user-1/notes.txt',
      MAX_TEXT_SOURCE_BYTES,
    );
    expect(renderFileTextPreview).not.toHaveBeenCalled();
  });

  it('preserves missing stored bytes as not found', async () => {
    mocks.readStoredMedia.mockResolvedValueOnce(null);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(renderFileTextPreview).not.toHaveBeenCalled();
  });

  it('does not label an unrelated storage failure as a size validation error', async () => {
    mocks.readStoredMedia.mockRejectedValueOnce(new Error('storage unavailable'));
    const response = await GET(request(), context());
    expect(response.status).toBe(500);
    expect(renderFileTextPreview).not.toHaveBeenCalled();
  });

  it('renders the stored text of the caller file', async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      kind: 'text',
      text: 'hello world\n',
      truncated: false,
      fileName: 'notes.txt',
    });
    expect(mocks.getActiveWorkspaceMediaAssetById).toHaveBeenCalledWith('user-1', FILE_ID, db, {
      organizationId: null,
    });
    expect(mocks.readStoredMedia).toHaveBeenCalledWith(
      'users/user-1/notes.txt',
      MAX_TEXT_SOURCE_BYTES,
    );
    expect(renderFileTextPreview).toHaveBeenCalledWith(
      'text',
      'notes.txt',
      'text/plain',
      Buffer.from('hello world\n'),
    );
  });

  it('renders a csv as a table', async () => {
    mocks.getActiveWorkspaceMediaAssetById.mockResolvedValue(
      asset({ mimeType: 'text/csv', metadata: { filename: 'rows.csv' } }),
    );
    mocks.readStoredMedia.mockResolvedValue({
      data: Buffer.from('a,b\n1,2\n'),
      contentType: 'text/csv',
    });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: 'table', text: 'a,b\n1,2\n' });
  });
});

type ImportedModule0 = typeof import('@/lib/server/file-text-preview');
