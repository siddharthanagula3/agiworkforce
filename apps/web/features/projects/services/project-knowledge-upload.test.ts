import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadProjectKnowledgeFile } from './project-knowledge-upload';

const csrfMocks = vi.hoisted(() => ({ getCsrfToken: vi.fn() }));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: csrfMocks.getCsrfToken,
}));

const REGISTERED_FILE = {
  id: 'file-1',
  projectId: 'project-1',
  fileName: 'notes.txt',
  mimeType: 'text/plain',
  byteCount: 5,
  checksumSha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  summary: null,
  sourceSurface: 'web',
  addedByUserId: 'user-1',
  addedAt: '2026-07-18T12:00:00.000Z',
  retentionExpiresAt: null,
  deletedAt: null,
  storageUri: 'https://files.example.test/knowledge-files/projects/project-1/notes.txt',
};

describe('uploadProjectKnowledgeFile', () => {
  beforeEach(() => {
    csrfMocks.getCsrfToken.mockResolvedValue('csrf-token');
    vi.stubGlobal('crypto', webcrypto);
  });

  it('runs the checksum, presign, object PUT, and registration transaction once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            uploadUrl: 'https://upload.example.test/signed',
            uploadHeaders: { 'Content-Type': 'text/plain' },
            publicUrl: REGISTERED_FILE.storageUri,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ file: REGISTERED_FILE }), { status: 201 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const progress = vi.fn();
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    const result = await uploadProjectKnowledgeFile({
      projectId: 'project-1',
      file,
      onProgress: progress,
    });

    expect(result).toEqual(REGISTERED_FILE);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([0, 80, 100]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/uploads/presign',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' }),
        body: JSON.stringify({
          kind: 'knowledge-file',
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          byteCount: 5,
          projectId: 'project-1',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://upload.example.test/signed',
      expect.objectContaining({ method: 'PUT', body: file }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/projects/project-1/knowledge-files',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(REGISTERED_FILE.checksumSha256),
      }),
    );
  });

  it('uses the shared attachment contract and performs no network calls for an invalid file', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['payload'], 'payload.bin', { type: 'application/octet-stream' });

    await expect(uploadProjectKnowledgeFile({ projectId: 'project-1', file })).rejects.toThrow(
      /not an accepted attachment type/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed registration response instead of fabricating success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              uploadUrl: 'https://upload.example.test/signed',
              publicUrl: REGISTERED_FILE.storageUri,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ file: { id: 'file-1' } }), { status: 201 }),
        ),
    );

    await expect(
      uploadProjectKnowledgeFile({
        projectId: 'project-1',
        file: new File(['hello'], 'notes.txt', { type: 'text/plain' }),
      }),
    ).rejects.toThrow('invalid file metadata');
  });
});
