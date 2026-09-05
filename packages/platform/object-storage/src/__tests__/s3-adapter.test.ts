import { describe, expect, it, vi } from 'vitest';
import { createS3Client, createS3ObjectStore } from '../adapters/s3';
import type { ObjectStorageConfig } from '../config';
import { ObjectStorageTimeoutError } from '../types';
import { createFakeS3Endpoint } from './fake-s3-endpoint';
import { runObjectStoreContract } from './object-store-contract';

const REQUEST_TIMEOUT_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 1_000;

const CONFIG: ObjectStorageConfig = {
  provider: 's3',
  endpoint: 'https://objects.example.test',
  region: 'auto',
  forcePathStyle: false,
  accessKeyId: 'access-key-id',
  secretAccessKey: 'secret-access-key',
  publicBucket: 'contract-bucket',
  privateBucket: 'contract-bucket-private',
  publicBaseUrl: 'https://assets.example.test',
};

runObjectStoreContract('s3', () =>
  createS3ObjectStore({
    client: createFakeS3Endpoint(CONFIG).client,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  }),
);

describe('s3 object store', () => {
  it('rejects at the deadline instead of hanging when the client never answers', async () => {
    vi.useFakeTimers();
    try {
      const client = createS3Client(CONFIG, {
        connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
      });
      Object.defineProperty(client, 'send', {
        value: () => new Promise(() => {}),
        writable: true,
      });
      const store = createS3ObjectStore({ client, requestTimeoutMs: REQUEST_TIMEOUT_MS });

      const pending = store.get('contract-bucket', 'object.png');
      const assertion = expect(pending).rejects.toBeInstanceOf(ObjectStorageTimeoutError);
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('signs the content type and the content length into a presigned upload', async () => {
    const store = createS3ObjectStore({
      client: createFakeS3Endpoint(CONFIG).client,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    });

    const url = new URL(
      await store.presignPut({
        bucket: 'contract-bucket',
        key: 'object.png',
        contentType: 'image/png',
        contentLength: 4096,
        expiresInSeconds: 300,
      }),
    );

    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
    expect(signedHeaders).toContain('content-type');
    expect(signedHeaders).toContain('content-length');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });
});
