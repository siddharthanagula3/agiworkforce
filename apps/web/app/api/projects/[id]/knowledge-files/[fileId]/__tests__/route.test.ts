import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  getUserScopedDb: vi.fn(),
  objectKeyFromStorageUri: vi.fn(),
  getProjectKnowledgeObject: vi.fn(),
  deleteProjectKnowledgeObject: vi.fn(),
  findOwnedProjectKnowledgeFile: vi.fn(),
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
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
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
  isProjectKnowledgeObjectStorageConfigured: vi.fn(),
  isSealedProjectKnowledgeKey: vi.fn(),
  sealProjectKnowledgeObject: vi.fn(),
  sealedProjectKnowledgeKey: vi.fn(),
  storeLocalProjectKnowledgeUpload: vi.fn(),
  verifyProjectKnowledgeUploadAuthorization: vi.fn(),
  getProjectKnowledgeObject: mocks.getProjectKnowledgeObject,
  deleteProjectKnowledgeObject: mocks.deleteProjectKnowledgeObject,
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

import { DELETE, GET } from '../route';

const db = { query: vi.fn(), execute: vi.fn() };
const context = () => ({ params: Promise.resolve({ id: 'p-1', fileId: 'f-1' }) });
const file = {
  fileName: 'report "q3".pdf',
  mimeType: 'application/pdf',
  storageUri: 's3://b/k/report.pdf',
};

function get(query = '') {
  return GET(
    new NextRequest(`http://localhost/api/projects/p-1/knowledge-files/f-1${query}`),
    context(),
  );
}

function del() {
  return DELETE(
    new NextRequest('http://localhost/api/projects/p-1/knowledge-files/f-1', { method: 'DELETE' }),
    context(),
  );
}

describe('/api/projects/[id]/knowledge-files/[fileId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockReset();
    db.execute.mockReset();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: 'org-1' });
    mocks.findOwnedProjectKnowledgeFile.mockResolvedValue(file);
    mocks.objectKeyFromStorageUri.mockReturnValue('k/report.pdf');
    mocks.getProjectKnowledgeObject.mockResolvedValue({
      contentType: 'application/pdf',
      data: new Uint8Array([1, 2, 3]),
    });
  });

  describe('GET', () => {
    it('returns 401 when the caller is not signed in', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

      const response = await get();

      expect(response.status).toBe(401);
    });

    it('returns 404 for a file outside the caller scope', async () => {
      mocks.findOwnedProjectKnowledgeFile.mockResolvedValue(null);

      const response = await get();

      expect(response.status).toBe(404);
      expect(mocks.findOwnedProjectKnowledgeFile).toHaveBeenCalledWith(
        db,
        { userId: 'user-1', organizationId: 'org-1' },
        'p-1',
        'f-1',
      );
      expect(mocks.getProjectKnowledgeObject).not.toHaveBeenCalled();
    });

    it('returns 404 when the stored object is gone', async () => {
      mocks.getProjectKnowledgeObject.mockResolvedValue(null);

      const response = await get();

      expect(response.status).toBe(404);
    });

    it('serves the bytes inline with no-store and nosniff', async () => {
      const response = await get();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/pdf');
      expect(response.headers.get('Content-Disposition')).toBe('inline');
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
      expect(mocks.getProjectKnowledgeObject).toHaveBeenCalledWith(
        'k/report.pdf',
        MAX_ATTACHMENT_BYTES,
      );
    });

    it('forces an attachment with a sanitized filename on download', async () => {
      const response = await get('?download=true');

      expect(response.headers.get('Content-Disposition')).toBe(
        'attachment; filename="report _q3_.pdf"',
      );
    });

    it('never serves stored markup as a renderable document', async () => {
      mocks.getProjectKnowledgeObject.mockResolvedValue({
        contentType: 'text/html',
        data: new Uint8Array([60]),
      });

      const response = await get();

      expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(response.headers.get('Content-Disposition')).toBe('attachment');
    });
  });

  describe('DELETE', () => {
    it('returns 401 when the caller is not signed in', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

      const response = await del();

      expect(response.status).toBe(401);
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('returns the csrf refusal before touching the file', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await del();

      expect(response.status).toBe(403);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns 404 when the caller does not own the file', async () => {
      db.query.mockResolvedValue([]);

      const response = await del();

      expect(response.status).toBe(404);
      expect(db.query).toHaveBeenCalledWith(expect.any(String), ['f-1', 'p-1', 'user-1', 'org-1']);
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('answers 503 while the knowledge schema is not migrated', async () => {
      db.query.mockRejectedValue(Object.assign(new Error('no table'), { code: '42P01' }));

      const response = await del();

      expect(response.status).toBe(503);
      expect((await response.json()).error).toBe('knowledge_files_unavailable');
    });

    it('soft deletes the row and removes the stored object', async () => {
      db.query.mockResolvedValue([{ storage_uri: 's3://b/k/report.pdf' }]);
      db.execute.mockResolvedValue(undefined);
      mocks.deleteProjectKnowledgeObject.mockResolvedValue(undefined);

      const response = await del();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(db.execute.mock.calls[0]?.[0]).toContain('set deleted_at = now()');
      expect(mocks.deleteProjectKnowledgeObject).toHaveBeenCalledWith('k/report.pdf');
    });

    it('restores the row when the stored object cannot be removed', async () => {
      db.query.mockResolvedValue([{ storage_uri: 's3://b/k/report.pdf' }]);
      db.execute.mockResolvedValue(undefined);
      mocks.deleteProjectKnowledgeObject.mockRejectedValue(new Error('s3 down'));

      const response = await del();

      expect(response.status).toBe(500);
      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(db.execute.mock.calls[1]?.[0]).toContain('set deleted_at = null');
    });
  });
});
