import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class GoogleDriveFileError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    GoogleDriveFileError,
    withRateLimit: vi.fn(),
    requireCsrfToken: vi.fn(),
    getUserScopedDb: vi.fn(),
    isPrivateObjectStorageConfigured: vi.fn(),
    putPrivateObject: vi.fn(),
    resolveConnectorAccessToken: vi.fn(),
    downloadGoogleDriveFile: vi.fn(),
    registerProjectKnowledgeFile: vi.fn(),
    deleteProjectKnowledgeObject: vi.fn(),
  };
});

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/server/object-storage', () => ({
  isPrivateObjectStorageConfigured: mocks.isPrivateObjectStorageConfigured,
  putPrivateObject: mocks.putPrivateObject,
}));
vi.mock('@/lib/secure-random', () => ({ secureFilenameSegment: () => 'abcdefghijklm' }));
vi.mock('@/lib/connectors/oauth-access', () => ({
  resolveConnectorAccessToken: mocks.resolveConnectorAccessToken,
}));
vi.mock('@/lib/connectors/google-drive-files', () => ({
  GOOGLE_DRIVE_CONNECTOR_ID: 'google-drive',
  GoogleDriveFileError: mocks.GoogleDriveFileError,
  downloadGoogleDriveFile: mocks.downloadGoogleDriveFile,
}));
vi.mock('@/lib/server/project-knowledge-files', () => ({
  registerProjectKnowledgeFile: mocks.registerProjectKnowledgeFile,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: mocks.deleteProjectKnowledgeObject,
}));

import { POST } from '../route';

const DRIVE_A = 'driveFileAAAA01';
const DRIVE_B = 'driveFileBBBB02';
const db = { query: vi.fn() };

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/projects/p-1/knowledge-files/google-drive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'p-1' }) },
  );
}

function driveFile(name: string) {
  return {
    fileName: name,
    mimeType: 'application/pdf',
    data: new Uint8Array([1, 2, 3]),
    webViewLink: null,
    version: '7',
  };
}

describe('POST /api/projects/[id]/knowledge-files/google-drive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockReset();
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'p-1' }]);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: 'org-1' });
    mocks.isPrivateObjectStorageConfigured.mockReturnValue(true);
    mocks.resolveConnectorAccessToken.mockResolvedValue({
      status: 'ready',
      accessToken: 'ya29.token',
      accountKey: 'acct-1',
    });
    mocks.putPrivateObject.mockResolvedValue(undefined);
    mocks.deleteProjectKnowledgeObject.mockResolvedValue(undefined);
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await post({ fileIds: [DRIVE_A] });

    expect(response.status).toBe(401);
  });

  it('returns the csrf refusal before reading the body', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await post({ fileIds: [DRIVE_A] });

    expect(response.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed json', '{'],
    ['no files', { fileIds: [] }],
    ['a malformed file id', { fileIds: ['../etc'] }],
    [
      'more than ten files',
      { fileIds: Array.from({ length: 11 }, (_, i) => `driveFile${i}xxxxx`) },
    ],
    ['an unknown field', { fileIds: [DRIVE_A], extra: 1 }],
  ])('rejects %s with 400', async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses a project shared with the workspace', async () => {
    db.query.mockReset();
    db.query.mockResolvedValueOnce([{ project_id: 'p-1' }]);

    const response = await post({ fileIds: [DRIVE_A] });

    expect(response.status).toBe(409);
    expect(mocks.resolveConnectorAccessToken).not.toHaveBeenCalled();
  });

  it('returns 404 for a project the caller does not own', async () => {
    db.query.mockReset();
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await post({ fileIds: [DRIVE_A] });

    expect(response.status).toBe(404);
    expect(db.query).toHaveBeenLastCalledWith(expect.any(String), ['p-1', 'user-1', 'org-1']);
  });

  it('refuses when private object storage is not configured', async () => {
    mocks.isPrivateObjectStorageConfigured.mockReturnValue(false);

    const response = await post({ fileIds: [DRIVE_A] });

    expect(response.status).toBe(503);
    expect(mocks.resolveConnectorAccessToken).not.toHaveBeenCalled();
  });

  it.each([
    ['reauthorization-required', 'google_drive_reconnect_required'],
    ['not-connected', 'google_drive_not_connected'],
  ])('asks the caller to connect Drive when access is %s', async (status, code) => {
    mocks.resolveConnectorAccessToken.mockResolvedValue({ status });

    const response = await post({ fileIds: [DRIVE_A] });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe(code);
    expect(mocks.resolveConnectorAccessToken).toHaveBeenCalledWith('user-1', 'google-drive');
    expect(mocks.downloadGoogleDriveFile).not.toHaveBeenCalled();
  });

  it('adds each Drive file under the caller scope and reports per-file outcomes', async () => {
    mocks.downloadGoogleDriveFile
      .mockResolvedValueOnce(driveFile('Plan.PDF'))
      .mockRejectedValueOnce(new mocks.GoogleDriveFileError('File is too large.', 413));
    mocks.registerProjectKnowledgeFile.mockResolvedValue({
      status: 'created',
      file: { id: 'kf-1' },
    });

    const response = await post({ fileIds: [DRIVE_A, DRIVE_B] });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      results: [
        { fileId: DRIVE_A, status: 'added', file: { id: 'kf-1' } },
        { fileId: DRIVE_B, status: 'failed', message: 'File is too large.' },
      ],
    });
    expect(mocks.downloadGoogleDriveFile).toHaveBeenCalledWith(
      'ya29.token',
      DRIVE_A,
      expect.any(Number),
    );
    const key = mocks.putPrivateObject.mock.calls[0]?.[0].key as string;
    expect(key).toMatch(/^knowledge-files\/projects\/p-1\/\d+_abcdefghijklm\.pdf$/);
    expect(mocks.registerProjectKnowledgeFile).toHaveBeenCalledWith(
      { db, userId: 'user-1', organizationId: 'org-1', projectId: 'p-1' },
      expect.objectContaining({ fileName: 'Plan.PDF', storageUri: key, byteCount: 3 }),
      expect.objectContaining({
        provider: 'google_drive',
        externalId: DRIVE_A,
        uri: `https://drive.google.com/file/d/${DRIVE_A}/view`,
        version: { kind: 'revision', value: '7' },
        accountKey: 'acct-1',
      }),
    );
  });

  it('removes the stored object and answers 422 when registration is unavailable', async () => {
    mocks.downloadGoogleDriveFile.mockResolvedValue(driveFile('notes.txt'));
    mocks.registerProjectKnowledgeFile.mockResolvedValue({ status: 'unavailable' });

    const response = await post({ fileIds: [DRIVE_A] });

    expect(response.status).toBe(422);
    const key = mocks.putPrivateObject.mock.calls[0]?.[0].key;
    expect(mocks.deleteProjectKnowledgeObject).toHaveBeenCalledWith(key);
    expect((await response.json()).results[0]).toEqual({
      fileId: DRIVE_A,
      status: 'failed',
      message: 'Project sources are not available yet.',
    });
  });

  it('hides unexpected failure detail from the caller', async () => {
    mocks.downloadGoogleDriveFile.mockRejectedValue(new Error('socket hang up at 10.0.0.3'));

    const response = await post({ fileIds: [DRIVE_A] });

    expect(response.status).toBe(422);
    expect((await response.json()).results[0].message).toBe(
      'This file could not be added. Try again.',
    );
  });
});
