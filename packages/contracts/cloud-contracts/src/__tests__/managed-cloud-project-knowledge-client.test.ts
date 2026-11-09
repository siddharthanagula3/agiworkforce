import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ManagedCloudProjectKnowledgeHttpError,
  createManagedCloudProjectKnowledgeClient,
} from '../managed-cloud-project-knowledge-client';

const STORAGE_KEY = 'knowledge-files/projects/project-1/notes.txt';
const CHECKSUM = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const REGISTERED_FILE = {
  id: 'file-1',
  projectId: 'project-1',
  fileName: 'notes.txt',
  mimeType: 'text/plain',
  byteCount: 5,
  checksumSha256: CHECKSUM,
  summary: null,
  sourceSurface: 'desktop',
  addedByUserId: 'user-1',
  addedAt: '2026-07-23T12:00:00.000Z',
  retentionExpiresAt: null,
  deletedAt: null,
  storageUri: '/api/projects/project-1/knowledge-files/file-1',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createManagedCloudProjectKnowledgeClient', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('authenticates the API relay before registering project knowledge', async () => {
    let credential = 0;
    const getHeaders = vi.fn(() => ({
      Authorization: `Bearer account-${++credential}`,
      'Content-Type': 'application/json',
    }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          uploadUrl: 'https://cloud.example/api/uploads/knowledge-file/put?token=fixture',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/plain' },
          storageKey: STORAGE_KEY,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ file: REGISTERED_FILE }));
    const uploadFetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer account-2'
        ? jsonResponse({ success: true })
        : jsonResponse({ error: 'Unauthorized' }, 401),
    );
    const client = createManagedCloudProjectKnowledgeClient({
      baseUrl: 'https://cloud.example',
      sourceSurface: 'desktop',
      getHeaders,
      fetchImpl,
      uploadFetchImpl,
    });
    await expect(
      client.upload('project-1', new File(['hello'], 'notes.txt', { type: 'text/plain' })),
    ).resolves.toEqual(REGISTERED_FILE);
    expect(new Headers(uploadFetchImpl.mock.calls[0]![1]!.headers).get('Content-Type')).toBe(
      'text/plain',
    );
    expect(getHeaders).toHaveBeenCalledTimes(3);
  });

  it('registers the opaque object key and never sends the legacy public URL', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          uploadUrl: 'https://upload.example.test/signed',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/plain' },
          storageKey: STORAGE_KEY,
          publicUrl: `https://public.example.test/${STORAGE_KEY}`,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ file: REGISTERED_FILE }, 201));
    const uploadFetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const client = createManagedCloudProjectKnowledgeClient({
      sourceSurface: 'desktop',
      fetchImpl,
      uploadFetchImpl,
    });

    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const result = await client.upload('project-1', file);

    expect(result).toEqual(REGISTERED_FILE);
    expect(uploadFetchImpl).toHaveBeenCalledWith(
      'https://upload.example.test/signed',
      expect.objectContaining({ method: 'PUT', body: file }),
    );
    const registration = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(registration[0]).toBe('/api/projects/project-1/knowledge-files');
    expect(JSON.parse(String(registration[1].body))).toMatchObject({
      storageUri: STORAGE_KEY,
      checksumSha256: CHECKSUM,
    });
    expect(String(registration[1].body)).not.toContain('public.example.test');
  });

  it('hands the registration notice to the caller and still returns the file', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          uploadUrl: 'https://upload.example.test/signed',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/plain' },
          storageKey: STORAGE_KEY,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ file: REGISTERED_FILE, notice: 'Some pages were not read.' }, 201),
      );
    const client = createManagedCloudProjectKnowledgeClient({
      sourceSurface: 'web',
      fetchImpl,
      uploadFetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    });
    const onNotice = vi.fn();

    const result = await client.upload(
      'project-1',
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
      { onNotice },
    );

    expect(result).toEqual(REGISTERED_FILE);
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith('Some pages were not read.');
  });

  it('deletes the uploaded object when registration fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          uploadUrl: 'https://upload.example.test/signed',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/plain' },
          storageKey: STORAGE_KEY,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'Knowledge registration failed' } }, 500),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const client = createManagedCloudProjectKnowledgeClient({
      sourceSurface: 'desktop',
      fetchImpl,
      uploadFetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    });

    await expect(
      client.upload('project-1', new File(['hello'], 'notes.txt', { type: 'text/plain' })),
    ).rejects.toBeInstanceOf(ManagedCloudProjectKnowledgeHttpError);

    const cleanup = fetchImpl.mock.calls[2] as [string, RequestInit];
    expect(cleanup[0]).toBe('/api/uploads/presign');
    expect(cleanup[1].method).toBe('DELETE');
    expect(JSON.parse(String(cleanup[1].body))).toEqual({
      kind: 'knowledge-file',
      projectId: 'project-1',
      storageKey: STORAGE_KEY,
    });
  });
});
