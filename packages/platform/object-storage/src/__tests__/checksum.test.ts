import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore } from '../adapters/memory';
import { getVerifiedObject, objectChecksum, putVerifiedObject } from '../checksum';
import { ObjectChecksumMismatchError } from '../types';

const BUCKET = 'contract-bucket';
const KEY = 'upload.bin';
const CONTENT_TYPE = 'application/octet-stream';
const BYTES = new Uint8Array([1, 2, 3, 4, 5]);

describe('object checksums', () => {
  it('computes the sha-256 of the bytes in base64', () => {
    expect(objectChecksum(BYTES)).toBe(createHash('sha256').update(BYTES).digest('base64'));
  });

  it('stores the checksum of an upload and reads it back on the head', async () => {
    const store = createMemoryObjectStore();

    const checksum = await putVerifiedObject(store, {
      bucket: BUCKET,
      key: KEY,
      body: BYTES,
      contentType: CONTENT_TYPE,
    });

    expect(checksum).toBe(objectChecksum(BYTES));
    expect((await store.head(BUCKET, KEY))?.checksumSha256).toBe(checksum);
  });

  it('fails the write when the host reports a different checksum than it was sent', async () => {
    const store = createMemoryObjectStore();
    vi.spyOn(store, 'head').mockResolvedValue({
      contentLength: BYTES.byteLength,
      contentType: CONTENT_TYPE,
      etag: '"etag"',
      checksumSha256: objectChecksum(new Uint8Array([9])),
      encryption: undefined,
      metadata: undefined,
    });

    await expect(
      putVerifiedObject(store, {
        bucket: BUCKET,
        key: KEY,
        body: BYTES,
        contentType: CONTENT_TYPE,
      }),
    ).rejects.toBeInstanceOf(ObjectChecksumMismatchError);
  });

  it('fails the read when the bytes served do not match the stored checksum', async () => {
    const store = createMemoryObjectStore();
    await putVerifiedObject(store, {
      bucket: BUCKET,
      key: KEY,
      body: BYTES,
      contentType: CONTENT_TYPE,
    });
    vi.spyOn(store, 'get').mockResolvedValue({
      data: new Uint8Array([9, 9, 9]),
      contentType: CONTENT_TYPE,
    });

    await expect(getVerifiedObject(store, BUCKET, KEY)).rejects.toBeInstanceOf(
      ObjectChecksumMismatchError,
    );
  });

  it('reads back bytes that match without complaint and reports a missing object as null', async () => {
    const store = createMemoryObjectStore();
    await putVerifiedObject(store, {
      bucket: BUCKET,
      key: KEY,
      body: BYTES,
      contentType: CONTENT_TYPE,
    });

    const stored = await getVerifiedObject(store, BUCKET, KEY);
    expect(stored ? Buffer.from(stored.data) : null).toEqual(Buffer.from(BYTES));
    expect(await getVerifiedObject(store, BUCKET, 'absent.bin')).toBeNull();
  });
});
