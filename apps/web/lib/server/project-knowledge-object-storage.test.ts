type OriginalObjectStorageModule = typeof import('./object-storage');
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalProjectKnowledgeUploadUrl,
  createProjectKnowledgeCleanupPlan,
  deleteProjectKnowledgeObject,
  getProjectKnowledgeObject,
  sealProjectKnowledgeObject,
  storeLocalProjectKnowledgeUpload,
} from './project-knowledge-object-storage';

vi.mock('./object-storage', async (importOriginal) => ({
  ...(await importOriginal<OriginalObjectStorageModule>()),
  putPrivateObject: vi.fn(async ({ key }: { key: string }) => ({ key })),
  copyPrivateObjectIfUnchanged: vi.fn(),
  isObjectStorageConfigured: () => false,
  isPrivateObjectStorageConfigured: () => false,
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  deleteObject: vi.fn(),
  deletePrivateObject: vi.fn(),
  createObjectCleanupPlan: vi.fn(),
  createPrivateObjectWriter: vi.fn(),
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {
    constructor(_key: string, maxBytes: number) {
      super(`Stored object exceeds the permitted ${maxBytes} bytes`);
      this.name = 'StoredObjectTooLargeError';
    }
  },
}));
vi.mock('./object-storage-runtime', () => ({
  getObjectStore: vi.fn(),
  objectStorageConfig: () => ({ secretAccessKey: undefined }),
}));

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

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
      checksumSha256: sha256Hex(bytes),
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
      etag: sha256Hex(bytes),
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
      checksumSha256: sha256Hex(bytes),
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

  it('refuses bytes that do not hash to the authorized content, at the same length and type', async () => {
    const key = 'knowledge-files/projects/project-1/inspected.txt';
    const inspected = new TextEncoder().encode('inspected source');
    const rewritten = new TextEncoder().encode('REWRITTEN SOURCE');
    expect(rewritten.byteLength).toBe(inspected.byteLength);

    const uploadUrl = await createLocalProjectKnowledgeUploadUrl({
      userId: 'user-1',
      key,
      contentType: 'text/plain',
      byteCount: inspected.byteLength,
      checksumSha256: sha256Hex(inspected),
    });
    const token = new URL(uploadUrl, 'http://localhost').searchParams.get('token')!;

    await expect(
      storeLocalProjectKnowledgeUpload({
        token,
        userId: 'user-1',
        contentType: 'text/plain',
        data: rewritten,
      }),
    ).rejects.toThrow(/do not match the authorized content/i);
    await expect(getProjectKnowledgeObject(key, inspected.byteLength)).resolves.toBeNull();
  });

  it('rejects a token used by a different signed-in owner', async () => {
    const bytes = new TextEncoder().encode('owner-bound');
    const uploadUrl = await createLocalProjectKnowledgeUploadUrl({
      userId: 'user-1',
      key: 'knowledge-files/projects/project-1/owner.txt',
      contentType: 'text/plain',
      byteCount: bytes.byteLength,
      checksumSha256: sha256Hex(bytes),
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

  it('seals inspected local bytes and refuses a source that changed since', async () => {
    const key = 'knowledge-files/projects/project-1/sealable.txt';
    const sealedKey = 'knowledge-files/projects/project-1/sealed/sealable.txt';
    const bytes = new TextEncoder().encode('inspected local source');
    const uploadUrl = await createLocalProjectKnowledgeUploadUrl({
      userId: 'user-1',
      key,
      contentType: 'text/plain',
      byteCount: bytes.byteLength,
      checksumSha256: sha256Hex(bytes),
    });
    const token = new URL(uploadUrl, 'http://localhost').searchParams.get('token')!;
    await storeLocalProjectKnowledgeUpload({
      token,
      userId: 'user-1',
      contentType: 'text/plain',
      data: bytes,
    });

    const inspected = Buffer.from(bytes);
    await expect(
      sealProjectKnowledgeObject({
        key,
        etag: sha256Hex(new TextEncoder().encode('other bytes')),
        bytes: inspected,
        contentType: 'text/plain',
      }),
    ).resolves.toBeNull();
    await expect(
      sealProjectKnowledgeObject({
        key,
        etag: sha256Hex(bytes),
        bytes: inspected,
        contentType: 'text/plain',
      }),
    ).resolves.toMatchObject({
      key: sealedKey,
      targets: {
        'local-bytes': path.join(scratch, '.agi-local-media/project-knowledge/objects'),
        'local-metadata': path.join(scratch, '.agi-local-media/project-knowledge/metadata'),
      },
    });
    await expect(getProjectKnowledgeObject(sealedKey, bytes.byteLength)).resolves.toEqual({
      data: Buffer.from(bytes),
      contentType: 'text/plain',
      etag: sha256Hex(bytes),
    });
  });

  it('refuses forged local targets and traversal before touching storage', async () => {
    const plan = createProjectKnowledgeCleanupPlan();
    for (const objectKey of ['../outside', 'knowledge-files/projects/project-1/../outside']) {
      await expect(
        plan.remove({ name: 'local-bytes', location: plan.targets['local-bytes']!, objectKey }),
      ).rejects.toThrow(/pinned local storage target/);
    }
    await expect(
      plan.remove({
        name: 'local-bytes',
        location: path.join(scratch, 'outside'),
        objectKey: 'knowledge-files/projects/project-1/source.txt',
      }),
    ).rejects.toThrow(/pinned local storage target/);
    await expect(
      plan.remove({
        name: '__proto__',
        location: plan.targets['local-bytes']!,
        objectKey: 'knowledge-files/projects/project-1/source.txt',
      }),
    ).rejects.toThrow(/pinned local storage target/);
  });
});
