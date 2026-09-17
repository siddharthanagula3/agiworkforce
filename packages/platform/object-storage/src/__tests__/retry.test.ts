import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { createMemoryObjectStore } from '../adapters/memory';
import {
  createRetryingObjectStore,
  isRetryableObjectStorageError,
  resolveObjectStorageRetryPolicy,
  OBJECT_STORAGE_RETRY_BASE_DELAY_MS_ENV,
  OBJECT_STORAGE_RETRY_MAX_ATTEMPTS_ENV,
  OBJECT_STORAGE_RETRY_MAX_DELAY_MS_ENV,
} from '../retry';
import { ObjectStorageTimeoutError, type ObjectStore } from '../types';

const BUCKET = 'media';
const KEY = 'attachments/object.png';
const CONTENT_TYPE = 'image/png';
const BYTES = new Uint8Array([1, 2, 3]);

function transientError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

function statusError(httpStatusCode: number): Error {
  return Object.assign(new Error(`status ${httpStatusCode}`), { $metadata: { httpStatusCode } });
}

function failingStore(
  failures: number,
  error: Error,
): { store: ObjectStore; inner: ObjectStore; attempts: () => number } {
  const inner = createMemoryObjectStore();
  let seen = 0;
  let remaining = failures;
  const store: ObjectStore = {
    ...inner,
    async put(input) {
      seen += 1;
      if (remaining-- > 0) throw error;
      return inner.put(input);
    },
    async get(bucket, key) {
      seen += 1;
      if (remaining-- > 0) throw error;
      return inner.get(bucket, key);
    },
  };
  return { store, inner, attempts: () => seen };
}

function retrying(store: ObjectStore, sleep = vi.fn(async () => undefined)) {
  return {
    sleep,
    wrapped: createRetryingObjectStore(store, {
      policy: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1_000 },
      sleep,
      random: () => 0,
    }),
  };
}

describe('object storage retry policy', () => {
  it('classifies transport faults, throttling and server errors as retryable', () => {
    expect(isRetryableObjectStorageError(new ObjectStorageTimeoutError(1_000))).toBe(true);
    expect(isRetryableObjectStorageError(transientError('SlowDown'))).toBe(true);
    expect(
      isRetryableObjectStorageError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })),
    ).toBe(true);
    expect(isRetryableObjectStorageError(statusError(429))).toBe(true);
    expect(isRetryableObjectStorageError(statusError(503))).toBe(true);
    expect(isRetryableObjectStorageError(new Error('boom'))).toBe(false);
    expect(isRetryableObjectStorageError(statusError(403))).toBe(false);
    expect(isRetryableObjectStorageError(statusError(404))).toBe(false);
    expect(isRetryableObjectStorageError(statusError(501))).toBe(false);
  });

  it('follows a wrapped cause', () => {
    const wrapped = Object.assign(new Error('outer'), { cause: statusError(500) });
    expect(isRetryableObjectStorageError(wrapped)).toBe(true);
  });

  it('retries a transient read and returns the eventual value', async () => {
    const { store, inner, attempts } = failingStore(2, statusError(503));
    await inner.put({ bucket: BUCKET, key: KEY, body: BYTES, contentType: CONTENT_TYPE });
    const { wrapped, sleep } = retrying(store);

    await expect(wrapped.get(BUCKET, KEY)).resolves.toEqual({
      data: BYTES,
      contentType: CONTENT_TYPE,
    });
    expect(attempts()).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('backs off exponentially between attempts', async () => {
    const { store } = failingStore(2, statusError(500));
    const { wrapped, sleep } = retrying(store);

    await wrapped.get(BUCKET, KEY);

    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([50, 100]);
  });

  it('gives up on a permanent failure without sleeping', async () => {
    const { store, attempts } = failingStore(1, statusError(403));
    const { wrapped, sleep } = retrying(store);

    await expect(wrapped.get(BUCKET, KEY)).rejects.toThrow('status 403');
    expect(attempts()).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('stops at the attempt ceiling and rethrows the last error', async () => {
    const { store, attempts } = failingStore(99, statusError(503));
    const { wrapped } = retrying(store);

    await expect(wrapped.get(BUCKET, KEY)).rejects.toThrow('status 503');
    expect(attempts()).toBe(3);
  });

  it('never replays a streamed upload, because the stream is already consumed', async () => {
    const { store, attempts } = failingStore(1, statusError(503));
    const { wrapped } = retrying(store);

    await expect(
      wrapped.put({
        bucket: BUCKET,
        key: KEY,
        body: Readable.from([Buffer.from(BYTES)]),
        contentType: CONTENT_TYPE,
      }),
    ).rejects.toThrow('status 503');
    expect(attempts()).toBe(1);
  });

  it('replays a buffered upload', async () => {
    const { store, attempts } = failingStore(1, statusError(503));
    const { wrapped } = retrying(store);

    await wrapped.put({ bucket: BUCKET, key: KEY, body: BYTES, contentType: CONTENT_TYPE });

    expect(attempts()).toBe(2);
  });

  it('reads the policy from the environment and clamps it', () => {
    expect(
      resolveObjectStorageRetryPolicy({
        [OBJECT_STORAGE_RETRY_MAX_ATTEMPTS_ENV]: '5',
        [OBJECT_STORAGE_RETRY_BASE_DELAY_MS_ENV]: '250',
        [OBJECT_STORAGE_RETRY_MAX_DELAY_MS_ENV]: '4000',
      }),
    ).toEqual({ maxAttempts: 5, baseDelayMs: 250, maxDelayMs: 4_000 });

    expect(
      resolveObjectStorageRetryPolicy({ [OBJECT_STORAGE_RETRY_MAX_ATTEMPTS_ENV]: '900' })
        .maxAttempts,
    ).toBe(10);
    expect(
      resolveObjectStorageRetryPolicy({ [OBJECT_STORAGE_RETRY_MAX_ATTEMPTS_ENV]: 'nonsense' }),
    ).toEqual(resolveObjectStorageRetryPolicy({}));
  });
});
