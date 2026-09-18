import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { objectChecksum } from '../checksum';
import { isPresignedUrlExpired, presignedUrlExpiresAt } from '../presign';
import { supportsMultipartUploads, type ObjectStore } from '../types';

const BUCKET = 'contract-bucket';
const KEY = 'object.png';
const NESTED_KEY = 'nested/prefix/object.png';
const MISSING_KEY = 'absent.png';
const CONTENT_TYPE = 'image/png';
const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const PRESIGN_TTL_SECONDS = 300;
const PRESIGN_CONTENT_LENGTH = 4096;
const RANGE_START = 2;
const RANGE_END = 4;
const MAX_TTL_SECONDS = 3_600;
const MULTIPART_KEY = 'large/object.bin';
const PART_ONE = new Uint8Array([10, 11, 12]);
const PART_TWO = new Uint8Array([20, 21, 22, 23]);

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.byteLength;
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

export function runObjectStoreContract(name: string, createStore: () => ObjectStore): void {
  describe(`${name} object store contract`, () => {
    async function seeded(): Promise<ObjectStore> {
      const store = createStore();
      await store.put({ bucket: BUCKET, key: KEY, body: BYTES, contentType: CONTENT_TYPE });
      return store;
    }

    it('reads back the bytes and content type it stored', async () => {
      const store = await seeded();
      const stored = await store.get(BUCKET, KEY);
      expect(stored?.contentType).toBe(CONTENT_TYPE);
      expect(stored ? Buffer.from(stored.data) : null).toEqual(Buffer.from(BYTES));
    });

    it('stores a stream body under a nested key', async () => {
      const store = createStore();
      await store.put({
        bucket: BUCKET,
        key: NESTED_KEY,
        body: Readable.from([Buffer.from(BYTES)]),
        contentType: CONTENT_TYPE,
        contentLength: BYTES.byteLength,
      });
      const stored = await store.get(BUCKET, NESTED_KEY);
      expect(stored ? Buffer.from(stored.data) : null).toEqual(Buffer.from(BYTES));
    });

    it('answers null for a key that was never written', async () => {
      const store = await seeded();
      expect(await store.get(BUCKET, MISSING_KEY)).toBeNull();
      expect(await store.getStream(BUCKET, MISSING_KEY)).toBeNull();
      expect(await store.head(BUCKET, MISSING_KEY)).toBeNull();
    });

    it('reports size, content type and an entity tag from head', async () => {
      const store = await seeded();
      const head = await store.head(BUCKET, KEY);
      expect(head?.contentLength).toBe(BYTES.byteLength);
      expect(head?.contentType).toBe(CONTENT_TYPE);
      expect(head?.etag).toBeTruthy();
    });

    it('streams the whole object without a range', async () => {
      const store = await seeded();
      const stream = await store.getStream(BUCKET, KEY);
      expect(stream?.contentLength).toBe(BYTES.byteLength);
      expect(stream?.contentRange).toBeUndefined();
      expect(stream ? Buffer.from(await drain(stream.body)) : null).toEqual(Buffer.from(BYTES));
    });

    it('streams only the requested range and reports it', async () => {
      const store = await seeded();
      const stream = await store.getStream(BUCKET, KEY, `bytes=${RANGE_START}-${RANGE_END}`);
      expect(stream?.contentLength).toBe(RANGE_END - RANGE_START + 1);
      expect(stream?.contentRange).toBe(`bytes ${RANGE_START}-${RANGE_END}/${BYTES.byteLength}`);
      expect(stream ? Buffer.from(await drain(stream.body)) : null).toEqual(
        Buffer.from(BYTES.subarray(RANGE_START, RANGE_END + 1)),
      );
    });

    it('deletes an object and tolerates deleting one that is gone', async () => {
      const store = await seeded();
      await store.delete(BUCKET, KEY);
      expect(await store.get(BUCKET, KEY)).toBeNull();
      await expect(store.delete(BUCKET, KEY)).resolves.toBeUndefined();
    });

    it('copies only while the source still carries the entity tag it was read at', async () => {
      const store = await seeded();
      const head = await store.head(BUCKET, KEY);
      const destinationKey = `${KEY}.copied`;

      await expect(
        store.copyIfMatch({
          bucket: BUCKET,
          sourceKey: KEY,
          destinationKey,
          etag: head?.etag ?? '',
        }),
      ).resolves.toBe(true);
      const copied = await store.get(BUCKET, destinationKey);
      expect(copied ? Buffer.from(copied.data) : null).toEqual(Buffer.from(BYTES));

      await store.put({
        bucket: BUCKET,
        key: KEY,
        body: new Uint8Array([9, 9, 9]),
        contentType: CONTENT_TYPE,
      });
      await expect(
        store.copyIfMatch({
          bucket: BUCKET,
          sourceKey: KEY,
          destinationKey: `${KEY}.stale`,
          etag: head?.etag ?? '',
        }),
      ).resolves.toBe(false);
    });

    it('presigns an upload that names the key', async () => {
      const store = await seeded();
      const url = await store.presignPut({
        bucket: BUCKET,
        key: KEY,
        contentType: CONTENT_TYPE,
        contentLength: PRESIGN_CONTENT_LENGTH,
        expiresInSeconds: PRESIGN_TTL_SECONDS,
      });
      expect(() => new URL(url)).not.toThrow();
      expect(url).toContain(KEY);
    });

    it('refuses to presign an upload that binds neither a size nor a type', async () => {
      const store = await seeded();
      await expect(
        store.presignPut({
          bucket: BUCKET,
          key: KEY,
          contentType: CONTENT_TYPE,
          contentLength: 0,
          expiresInSeconds: PRESIGN_TTL_SECONDS,
        }),
      ).rejects.toThrow('positive content length');
      await expect(
        store.presignPut({
          bucket: BUCKET,
          key: KEY,
          contentType: '   ',
          contentLength: PRESIGN_CONTENT_LENGTH,
          expiresInSeconds: PRESIGN_TTL_SECONDS,
        }),
      ).rejects.toThrow('must bind a content type');
    });

    it('refuses to presign an upload that never expires', async () => {
      const store = await seeded();
      await expect(
        store.presignPut({
          bucket: BUCKET,
          key: KEY,
          contentType: CONTENT_TYPE,
          contentLength: PRESIGN_CONTENT_LENGTH,
          expiresInSeconds: 0,
        }),
      ).rejects.toThrow('must expire');
      await expect(
        store.presignPut({
          bucket: BUCKET,
          key: KEY,
          contentType: CONTENT_TYPE,
          contentLength: PRESIGN_CONTENT_LENGTH,
          expiresInSeconds: MAX_TTL_SECONDS + 1,
        }),
      ).rejects.toThrow('may not outlive');
    });

    it('issues a signed url that is expired once its lifetime has passed', async () => {
      const store = await seeded();
      const url = await store.presignPut({
        bucket: BUCKET,
        key: KEY,
        contentType: CONTENT_TYPE,
        contentLength: PRESIGN_CONTENT_LENGTH,
        expiresInSeconds: PRESIGN_TTL_SECONDS,
      });

      const expiresAt = presignedUrlExpiresAt(url);
      expect(expiresAt).not.toBeNull();
      expect(isPresignedUrlExpired(url, (expiresAt as number) - 1)).toBe(false);
      expect(isPresignedUrlExpired(url, expiresAt as number)).toBe(true);
    });

    it('reports the checksum of the bytes it stored and refuses bytes that do not match', async () => {
      const store = await seeded();
      const head = await store.head(BUCKET, KEY);
      expect(head?.checksumSha256).toBe(objectChecksum(BYTES));

      await expect(
        store.put({
          bucket: BUCKET,
          key: `${KEY}.mismatched`,
          body: BYTES,
          contentType: CONTENT_TYPE,
          checksumSha256: objectChecksum(new Uint8Array([0])),
        }),
      ).rejects.toThrow(/checksum/iu);
    });

    it('assembles a multipart upload and reports it pending until it completes', async () => {
      const store = createStore();
      if (!supportsMultipartUploads(store)) return;

      const handle = await store.createMultipartUpload({
        bucket: BUCKET,
        key: MULTIPART_KEY,
        contentType: CONTENT_TYPE,
      });
      const first = await store.uploadPart({ ...handle, partNumber: 1, body: PART_ONE });
      expect(first.checksumSha256).toBe(objectChecksum(PART_ONE));
      expect(await store.listPendingMultipartUploads(BUCKET)).toHaveLength(1);
      expect(await store.listUploadedParts(handle)).toHaveLength(1);

      const second = await store.uploadPart({ ...handle, partNumber: 2, body: PART_TWO });
      await store.completeMultipartUpload({ ...handle, parts: [first, second] });

      const stored = await store.get(BUCKET, MULTIPART_KEY);
      expect(stored ? Buffer.from(stored.data) : null).toEqual(
        Buffer.concat([Buffer.from(PART_ONE), Buffer.from(PART_TWO)]),
      );
      expect(await store.listPendingMultipartUploads(BUCKET)).toEqual([]);
    });

    it('drops the parts of an aborted multipart upload without writing the object', async () => {
      const store = createStore();
      if (!supportsMultipartUploads(store)) return;

      const handle = await store.createMultipartUpload({
        bucket: BUCKET,
        key: MULTIPART_KEY,
        contentType: CONTENT_TYPE,
      });
      await store.uploadPart({ ...handle, partNumber: 1, body: PART_ONE });
      await store.abortMultipartUpload(handle);

      expect(await store.listPendingMultipartUploads(BUCKET)).toEqual([]);
      expect(await store.get(BUCKET, MULTIPART_KEY)).toBeNull();
    });
  });
}
