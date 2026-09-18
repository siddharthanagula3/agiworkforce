import { describe, expect, it, vi } from 'vitest';
import { createS3Client, createS3ObjectStore } from '../adapters/s3';
import type { ObjectStorageConfig } from '../config';
import { ObjectStorageConfigError, ObjectStorageTimeoutError } from '../types';
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
  encryption: undefined,
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

  it('records the region and the configured encryption on every object it writes', async () => {
    const store = createS3ObjectStore({
      client: createFakeS3Endpoint(CONFIG).client,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      encryption: { algorithm: 'aws:kms', keyId: 'key-id' },
      region: 'us-east-1',
    });

    await store.put({
      bucket: 'contract-bucket',
      key: 'object.png',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
    });
    const head = await store.head('contract-bucket', 'object.png');

    expect(head?.encryption).toEqual({ algorithm: 'aws:kms', keyId: undefined });
    expect(head?.metadata).toEqual({ 'agi-region': 'us-east-1', 'agi-encryption': 'aws:kms' });
  });

  it('refuses an encryption algorithm the host does not offer', async () => {
    const store = createS3ObjectStore({
      client: createFakeS3Endpoint(CONFIG).client,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      encryption: { algorithm: 'rot13', keyId: undefined },
    });

    await expect(
      store.put({
        bucket: 'contract-bucket',
        key: 'object.png',
        body: new Uint8Array([1]),
        contentType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(ObjectStorageConfigError);
  });
});
