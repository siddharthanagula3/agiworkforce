import { describe, expect, it, vi } from 'vitest';
import { createS3Client, createS3ObjectStore } from '../adapters/s3';
import type { ObjectStorageConfig } from '../config';
import { ObjectStorageConfigError, ObjectStorageTimeoutError } from '../types';
import { ENCRYPTION_UPLOAD_HEADER_NAMES } from '../upload-headers';
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

const PRESIGN_INPUT = {
  bucket: 'contract-bucket',
  key: 'object.png',
  contentType: 'image/png',
  contentLength: 4096,
  expiresInSeconds: 300,
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

    const presigned = await store.presignPut(PRESIGN_INPUT);
    const url = new URL(presigned.url);

    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
    expect(signedHeaders).toContain('content-type');
    expect(signedHeaders).toContain('content-length');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });

  it('asks for no encryption on a presigned upload when none is configured', async () => {
    const store = createS3ObjectStore({
      client: createFakeS3Endpoint(CONFIG).client,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    });

    const presigned = await store.presignPut(PRESIGN_INPUT);
    const url = new URL(presigned.url);

    expect(presigned.headers).toEqual({});
    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
    expect(signedHeaders.filter((name) => name.startsWith('x-amz-server-side-encryption'))).toEqual(
      [],
    );
  });

  it.each([
    [
      'a kms key',
      { algorithm: 'aws:kms', keyId: 'arn:aws:kms:us-east-1:111122223333:key/abc' },
      {
        'x-amz-server-side-encryption': 'aws:kms',
        'x-amz-server-side-encryption-aws-kms-key-id': 'arn:aws:kms:us-east-1:111122223333:key/abc',
      },
    ],
    [
      'an algorithm alone',
      { algorithm: 'AES256', keyId: undefined },
      { 'x-amz-server-side-encryption': 'AES256' },
    ],
  ])(
    'signs the configured encryption of %s into a presigned upload and returns it as required headers',
    async (_label, encryption, expected) => {
      const store = createS3ObjectStore({
        client: createFakeS3Endpoint(CONFIG).client,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        encryption,
      });

      const presigned = await store.presignPut(PRESIGN_INPUT);
      const url = new URL(presigned.url);

      expect(presigned.headers).toEqual(expected);
      const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
      for (const name of Object.keys(expected)) {
        expect(signedHeaders).toContain(name);
      }
      expect(
        signedHeaders.filter((name) => name.startsWith('x-amz-server-side-encryption')),
      ).toEqual(Object.keys(expected).sort());
      expect([...url.searchParams.keys()].map((name) => name.toLowerCase())).not.toContain(
        'x-amz-server-side-encryption',
      );
    },
  );

  it('signs exactly the header names the upload contract returns', async () => {
    const store = createS3ObjectStore({
      client: createFakeS3Endpoint(CONFIG).client,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      encryption: { algorithm: 'aws:kms', keyId: 'key-id' },
    });

    const presigned = await store.presignPut(PRESIGN_INPUT);
    const signedHeaders =
      new URL(presigned.url).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];

    expect(Object.keys(presigned.headers).sort()).toEqual(
      [...ENCRYPTION_UPLOAD_HEADER_NAMES].sort(),
    );
    expect(signedHeaders).toEqual(expect.arrayContaining(Object.keys(presigned.headers)));
  });

  it('refuses to presign an upload with an encryption the host does not offer', async () => {
    const store = createS3ObjectStore({
      client: createFakeS3Endpoint(CONFIG).client,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      encryption: { algorithm: 'rot13', keyId: undefined },
    });

    await expect(store.presignPut(PRESIGN_INPUT)).rejects.toBeInstanceOf(ObjectStorageConfigError);
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

  it('asks for the configured encryption when it copies an object into place', async () => {
    const { client } = createFakeS3Endpoint(CONFIG);
    const send = vi.spyOn(client, 'send');
    const store = createS3ObjectStore({
      client,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      encryption: { algorithm: 'aws:kms', keyId: 'key-id' },
    });
    await store.put({
      bucket: 'contract-bucket',
      key: 'source.png',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
    });
    const head = await store.head('contract-bucket', 'source.png');

    await store.copyIfMatch({
      bucket: 'contract-bucket',
      sourceKey: 'source.png',
      destinationKey: 'destination.png',
      etag: head?.etag ?? '',
    });

    const copy = send.mock.calls
      .map(([command]) => command as { constructor: { name: string }; input: object })
      .find((command) => command.constructor.name === 'CopyObjectCommand');
    expect(copy?.input).toMatchObject({
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: 'key-id',
    });
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
