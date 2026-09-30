import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  objectKeyFromStorageUri: vi.fn(),
  getProjectKnowledgeObject: vi.fn(),
  findOwnedProjectKnowledgeFile: vi.fn(),
  fileTextPreviewKind: vi.fn(),
  renderFileTextPreview: vi.fn(),
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
vi.mock('@/lib/server/object-storage', () => ({
  ObjectStorageTimeoutError: class ObjectStorageTimeoutError extends Error {},
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  copyPrivateObjectIfUnchanged: vi.fn(),
  deleteObject: vi.fn(),
  deletePrivateObject: vi.fn(),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  getObject: vi.fn(),
  getObjectStream: vi.fn(),
  getPresignedPrivateDownloadUrl: vi.fn(),
  getPresignedPrivateUploadUrl: vi.fn(),
  getPresignedUploadUrl: vi.fn(),
  getPrivateObject: vi.fn(),
  getPrivateObjectStream: vi.fn(),
  headPrivateObject: vi.fn(),
  isObjectStorageConfigured: vi.fn(),
  isPrivateObjectStorageConfigured: vi.fn(),
  objectKeyFromPublicUrl: vi.fn(),
  publicUrlForKey: vi.fn(),
  putObject: vi.fn(),
  putPrivateObject: vi.fn(),
  objectKeyFromStorageUri: mocks.objectKeyFromStorageUri,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  assertUploadMatchesAuthorization: vi.fn(),
  createLocalProjectKnowledgeUploadUrl: vi.fn(),
  createProjectKnowledgeUploadAuthorization: vi.fn(),
  deleteProjectKnowledgeObject: vi.fn(),
  isProjectKnowledgeObjectStorageConfigured: vi.fn(),
  isSealedProjectKnowledgeKey: vi.fn(),
  sealProjectKnowledgeObject: vi.fn(),
  sealedProjectKnowledgeKey: vi.fn(),
  storeLocalProjectKnowledgeUpload: vi.fn(),
  verifyProjectKnowledgeUploadAuthorization: vi.fn(),
  getProjectKnowledgeObject: mocks.getProjectKnowledgeObject,
}));
vi.mock('@/lib/server/project-knowledge-files', () => ({
  checkProjectKnowledgeCapacity: vi.fn(),
  findProjectKnowledgeFileByChecksum: vi.fn(),
  isSchemaNotReady: vi.fn(),
  projectKnowledgeResponse: vi.fn(),
  readIndexStates: vi.fn(),
  registerProjectKnowledgeFile: vi.fn(),
  findOwnedProjectKnowledgeFile: mocks.findOwnedProjectKnowledgeFile,
}));
vi.mock('@/lib/server/file-text-preview', () => ({
  fileTextPreviewKind: mocks.fileTextPreviewKind,
  renderFileTextPreview: mocks.renderFileTextPreview,
}));

import { GET } from '../route';

const db = { query: vi.fn() };
const file = { fileName: 'notes.md', mimeType: 'text/markdown', storageUri: 's3://b/k/notes.md' };
const bytes = new Uint8Array([104, 105]);

function call() {
  return GET(new NextRequest('http://localhost/api/projects/p-1/knowledge-files/f-1/text'), {
    params: Promise.resolve({ id: 'p-1', fileId: 'f-1' }),
  });
}

describe('GET /api/projects/[id]/knowledge-files/[fileId]/text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: 'org-1' });
    mocks.findOwnedProjectKnowledgeFile.mockResolvedValue(file);
    mocks.fileTextPreviewKind.mockReturnValue('markdown');
    mocks.objectKeyFromStorageUri.mockReturnValue('k/notes.md');
    mocks.getProjectKnowledgeObject.mockResolvedValue({ data: bytes });
  });

  it('returns the rate limit response before authenticating', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call();

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'files-serve');
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call();

    expect(response.status).toBe(401);
  });

  it('returns 404 for a file outside the caller scope', async () => {
    mocks.findOwnedProjectKnowledgeFile.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(404);
    expect(mocks.getProjectKnowledgeObject).not.toHaveBeenCalled();
  });

  it('returns 404 for a file type with no text preview', async () => {
    mocks.fileTextPreviewKind.mockReturnValue(null);

    const response = await call();

    expect(response.status).toBe(404);
    expect(mocks.getProjectKnowledgeObject).not.toHaveBeenCalled();
  });

  it('returns 404 when the storage uri has no object key', async () => {
    mocks.objectKeyFromStorageUri.mockReturnValue(null);

    const response = await call();

    expect(response.status).toBe(404);
    expect(mocks.getProjectKnowledgeObject).not.toHaveBeenCalled();
  });

  it('returns 404 when the stored object is gone', async () => {
    mocks.getProjectKnowledgeObject.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(404);
    expect(mocks.renderFileTextPreview).not.toHaveBeenCalled();
  });

  it('renders the preview of a file the caller owns', async () => {
    const preview = { kind: 'markdown', text: 'hi', truncated: false };
    mocks.renderFileTextPreview.mockResolvedValue(preview);

    const response = await call();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual(preview);
    expect(mocks.findOwnedProjectKnowledgeFile).toHaveBeenCalledWith(
      db,
      { userId: 'user-1', organizationId: 'org-1' },
      'p-1',
      'f-1',
    );
    expect(mocks.getProjectKnowledgeObject).toHaveBeenCalledWith(
      'k/notes.md',
      MAX_ATTACHMENT_BYTES,
    );
    expect(mocks.renderFileTextPreview).toHaveBeenCalledWith(
      'markdown',
      'notes.md',
      'text/markdown',
      bytes,
    );
  });
});
