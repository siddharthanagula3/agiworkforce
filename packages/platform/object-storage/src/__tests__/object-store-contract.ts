import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { ObjectStore } from '../types';

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
  });
}
