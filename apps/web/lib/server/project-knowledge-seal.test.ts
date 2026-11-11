import { createMemoryObjectStore, type MemoryObjectStore } from '@agiworkforce/object-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PRIVATE_BUCKET = 'agi-private-test';

const store: MemoryObjectStore = createMemoryObjectStore();

vi.mock('./object-storage-runtime', () => ({
  getObjectStore: () => store,
  objectStorageConfig: () => ({
    provider: 's3' as const,
    endpoint: 'https://storage.example.test',
    region: 'auto',
    forcePathStyle: false,
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
    publicBucket: 'agi-public-test',
    privateBucket: PRIVATE_BUCKET,
    publicBaseUrl: 'https://files.example.test/assets',
  }),
}));

const {
  createProjectKnowledgeUploadAuthorization,
  createProjectKnowledgeCleanupPlan,
  getProjectKnowledgeObject,
  isSealedProjectKnowledgeKey,
  sealProjectKnowledgeObject,
  sealedProjectKnowledgeKey,
} = await import('./project-knowledge-object-storage');

const UPLOAD_KEY = 'knowledge-files/projects/project-1/1700000000000_abcdefghijklm.txt';
const SEALED_KEY = 'knowledge-files/projects/project-1/sealed/1700000000000_abcdefghijklm.txt';
const INSPECTED = new TextEncoder().encode('inspected project source');
const REWRITTEN = new TextEncoder().encode('REWRITTEN PROJECT SOURCE');

async function putUploaded(data: Uint8Array): Promise<void> {
  await store.put({
    bucket: PRIVATE_BUCKET,
    key: UPLOAD_KEY,
    body: data,
    contentType: 'text/plain',
  });
}

describe('sealing an inspected project knowledge object', () => {
  beforeEach(() => {
    store.clear();
  });

  it('promotes the inspected bytes to a key no upload authorization can name', async () => {
    await putUploaded(INSPECTED);
    const inspected = await getProjectKnowledgeObject(UPLOAD_KEY, INSPECTED.byteLength);

    const sealed = await sealProjectKnowledgeObject({
      key: UPLOAD_KEY,
      etag: inspected?.etag,
      bytes: Buffer.from(INSPECTED),
      contentType: 'text/plain',
    });

    expect(sealed).toEqual({
      key: SEALED_KEY,
      targets: { private: createProjectKnowledgeCleanupPlan().targets['private'] },
    });
    expect(isSealedProjectKnowledgeKey(SEALED_KEY)).toBe(true);
    expect(sealedProjectKnowledgeKey(SEALED_KEY)).toBeNull();
    await expect(
      getProjectKnowledgeObject(SEALED_KEY, INSPECTED.byteLength),
    ).resolves.toMatchObject({ data: Buffer.from(INSPECTED), contentType: 'text/plain' });
    await expect(
      createProjectKnowledgeUploadAuthorization({
        userId: 'user-1',
        key: SEALED_KEY,
        contentType: 'text/plain',
        byteCount: INSPECTED.byteLength,
        checksumSha256: 'a'.repeat(64),
      }),
    ).rejects.toThrow(/destination is invalid/i);
  });

  it('seals the inspected bytes, not a rewritten live object', async () => {
    await putUploaded(INSPECTED);
    const inspected = await getProjectKnowledgeObject(UPLOAD_KEY, INSPECTED.byteLength);
    expect(REWRITTEN.byteLength).toBe(INSPECTED.byteLength);
    await putUploaded(REWRITTEN);

    await expect(
      sealProjectKnowledgeObject({
        key: UPLOAD_KEY,
        etag: inspected?.etag,
        bytes: Buffer.from(INSPECTED),
        contentType: 'text/plain',
      }),
    ).resolves.toEqual({
      key: SEALED_KEY,
      targets: { private: createProjectKnowledgeCleanupPlan().targets['private'] },
    });
    await expect(
      getProjectKnowledgeObject(SEALED_KEY, INSPECTED.byteLength),
    ).resolves.toMatchObject({ data: Buffer.from(INSPECTED), contentType: 'text/plain' });
  });

  it('never seals an object it could not pin to an entity tag', async () => {
    await putUploaded(INSPECTED);

    await expect(
      sealProjectKnowledgeObject({
        key: UPLOAD_KEY,
        etag: undefined,
        bytes: Buffer.from(INSPECTED),
        contentType: 'text/plain',
      }),
    ).resolves.toBeNull();
    await expect(getProjectKnowledgeObject(SEALED_KEY, INSPECTED.byteLength)).resolves.toBeNull();
  });
});
