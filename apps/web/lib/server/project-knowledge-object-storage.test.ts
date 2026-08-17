import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalProjectKnowledgeUploadUrl,
  deleteProjectKnowledgeObject,
  getProjectKnowledgeObject,
  storeLocalProjectKnowledgeUpload,
} from './project-knowledge-object-storage';

vi.mock('./object-storage', () => ({
  isObjectStorageConfigured: () => false,
  isPrivateObjectStorageConfigured: () => false,
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  deleteObject: vi.fn(),
  deletePrivateObject: vi.fn(),
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {
    constructor(_key: string, maxBytes: number) {
      super(`Stored object exceeds the permitted ${maxBytes} bytes`);
      this.name = 'StoredObjectTooLargeError';
    }
  },
}));

describe('local project knowledge storage', () => {
  let scratch = '';
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'agi-project-knowledge-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(scratch);
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    vi.unstubAllEnvs();
    await rm(scratch, { recursive: true, force: true });
  });

  it('authorizes, stores, reloads, and removes exact project bytes locally', async () => {
    const key = 'knowledge-files/projects/project-1/source.txt';
    const bytes = new TextEncoder().encode('durable local source');
    const uploadUrl = await createLocalProjectKnowledgeUploadUrl({
      userId: 'user-1',
      key,
      contentType: 'text/plain',
      byteCount: bytes.byteLength,
    });
    const token = new URL(uploadUrl, 'http://localhost').searchParams.get('token');
    expect(token).toBeTruthy();

    await storeLocalProjectKnowledgeUpload({
      token: token!,
      userId: 'user-1',
      contentType: 'text/plain',
      data: bytes,
    });

    await expect(getProjectKnowledgeObject(key, bytes.byteLength)).resolves.toEqual({
      data: Buffer.from(bytes),
      contentType: 'text/plain',
    });
    await expect(
      storeLocalProjectKnowledgeUpload({
        token: token!,
        userId: 'user-1',
        contentType: 'text/plain',
        data: bytes,
      }),
    ).rejects.toThrow(/already been used/i);
    await deleteProjectKnowledgeObject(key);
    await expect(getProjectKnowledgeObject(key, bytes.byteLength)).resolves.toBeNull();
  });

  it('refuses to read a stored file larger than the caller allows', async () => {
    const key = 'knowledge-files/projects/project-1/oversized.txt';
    const bytes = new TextEncoder().encode('this local object is larger than the caller declared');
    const uploadUrl = await createLocalProjectKnowledgeUploadUrl({
      userId: 'user-1',
      key,
      contentType: 'text/plain',
      byteCount: bytes.byteLength,
    });
    const token = new URL(uploadUrl, 'http://localhost').searchParams.get('token')!;
    await storeLocalProjectKnowledgeUpload({
      token,
      userId: 'user-1',
      contentType: 'text/plain',
      data: bytes,
    });

    await expect(getProjectKnowledgeObject(key, bytes.byteLength - 1)).rejects.toThrow(
      /exceeds the permitted/i,
    );
  });

  it('rejects a token used by a different signed-in owner', async () => {
    const bytes = new TextEncoder().encode('owner-bound');
    const uploadUrl = await createLocalProjectKnowledgeUploadUrl({
      userId: 'user-1',
      key: 'knowledge-files/projects/project-1/owner.txt',
      contentType: 'text/plain',
      byteCount: bytes.byteLength,
    });
    const token = new URL(uploadUrl, 'http://localhost').searchParams.get('token')!;

    await expect(
      storeLocalProjectKnowledgeUpload({
        token,
        userId: 'user-2',
        contentType: 'text/plain',
        data: bytes,
      }),
    ).rejects.toThrow(/invalid or expired/i);
  });
});
