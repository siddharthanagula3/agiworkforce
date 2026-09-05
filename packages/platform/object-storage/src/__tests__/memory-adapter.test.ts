import { describe, expect, it } from 'vitest';
import { createMemoryObjectStore } from '../adapters/memory';
import { ObjectStorageConfigError } from '../types';
import { runObjectStoreContract } from './object-store-contract';

const UPLOAD_BASE_URL = 'https://uploads.example.test/local-object-upload';
const PRESIGN_TTL_SECONDS = 300;
const PRESIGN_CONTENT_LENGTH = 4096;

runObjectStoreContract('memory', () => createMemoryObjectStore({ uploadBaseUrl: UPLOAD_BASE_URL }));

describe('memory object store', () => {
  it('refuses to presign an upload when no upload base url is configured', async () => {
    await expect(
      createMemoryObjectStore().presignPut({
        bucket: 'bucket',
        key: 'object.png',
        contentType: 'image/png',
        contentLength: PRESIGN_CONTENT_LENGTH,
        expiresInSeconds: PRESIGN_TTL_SECONDS,
      }),
    ).rejects.toBeInstanceOf(ObjectStorageConfigError);
  });

  it('binds the key, the type, the size and an expiry into the upload url', async () => {
    const now = 1_700_000_000_000;
    const url = new URL(
      await createMemoryObjectStore({ uploadBaseUrl: UPLOAD_BASE_URL, now: () => now }).presignPut({
        bucket: 'bucket',
        key: 'object.png',
        contentType: 'image/png',
        contentLength: PRESIGN_CONTENT_LENGTH,
        expiresInSeconds: PRESIGN_TTL_SECONDS,
      }),
    );

    expect(url.searchParams.get('key')).toBe('object.png');
    expect(url.searchParams.get('contentType')).toBe('image/png');
    expect(url.searchParams.get('contentLength')).toBe(String(PRESIGN_CONTENT_LENGTH));
    expect(Number(url.searchParams.get('expiresAt'))).toBeGreaterThan(now);
  });

  it('keeps buckets separate', async () => {
    const store = createMemoryObjectStore();
    await store.put({
      bucket: 'public',
      key: 'object.png',
      body: new Uint8Array([1]),
      contentType: 'image/png',
    });

    expect(await store.get('private', 'object.png')).toBeNull();
    expect(await store.get('public', 'object.png')).not.toBeNull();
  });
});
