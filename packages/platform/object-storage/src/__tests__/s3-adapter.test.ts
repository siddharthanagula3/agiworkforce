import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CopyObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const COPY_DEADLINE_MS = REQUEST_TIMEOUT_MS * 16;
const SLOW_COPY_MS = REQUEST_TIMEOUT_MS * 3;

const COPY_INPUT = {
  bucket: 'contract-bucket',
  sourceKey: 'staging.pdf',
  destinationKey: 'staging.pdf.scanned',
  etag: '"etag"',
};

const LOCAL_REQUEST_TIMEOUT_MS = 200;
const LOCAL_ANSWER_DELAY_MS = 800;

const SERVER_ERROR_STATUS = 500;
const SERVER_ERROR_BODY =
  '<?xml version="1.0" encoding="UTF-8"?><Error><Code>InternalError</Code><Message>We encountered an internal error. Please try again.</Message></Error>';

interface DelayingEndpoint {
  url: string;
  requestCount(): number;
  close(): Promise<void>;
}

const openEndpoints: DelayingEndpoint[] = [];

async function startDelayingEndpoint(
  delayMs: number,
  status: number = 200,
): Promise<DelayingEndpoint> {
  let requests = 0;
  const server: Server = createServer((request, response) => {
    requests += 1;
    request.resume();
    const timer = setTimeout(() => {
      if (response.destroyed) return;
      if (status === SERVER_ERROR_STATUS) {
        response.writeHead(status, { 'Content-Type': 'application/xml' });
        response.end(SERVER_ERROR_BODY);
        return;
      }
      response.writeHead(status, { ETag: '"etag"', 'Content-Length': '0' });
      response.end();
    }, delayMs);
    response.on('close', () => clearTimeout(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const endpoint = {
    url: `http://127.0.0.1:${port}`,
    requestCount: () => requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  openEndpoints.push(endpoint);
  return endpoint;
}

afterEach(async () => {
  await Promise.all(openEndpoints.splice(0).map((endpoint) => endpoint.close()));
});

describe('s3 client request deadline', () => {
  it('cuts a request that outlives the deadline when the client enforces it', async () => {
    const endpoint = await startDelayingEndpoint(LOCAL_ANSWER_DELAY_MS);
    const client = createS3Client(
      { ...CONFIG, endpoint: endpoint.url, forcePathStyle: true },
      {
        connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
        requestTimeoutMs: LOCAL_REQUEST_TIMEOUT_MS,
        enforceRequestTimeout: true,
      },
    );
    try {
      const store = createS3ObjectStore({ client, requestTimeoutMs: REQUEST_TIMEOUT_MS });

      await expect(store.head('contract-bucket', 'object.pdf')).rejects.toMatchObject({
        name: 'TimeoutError',
      });
    } finally {
      client.destroy();
    }
  });

  it('only warns past the deadline when the client does not enforce it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const endpoint = await startDelayingEndpoint(LOCAL_ANSWER_DELAY_MS);
    const client = createS3Client(
      { ...CONFIG, endpoint: endpoint.url, forcePathStyle: true },
      { connectionTimeoutMs: CONNECTION_TIMEOUT_MS, requestTimeoutMs: LOCAL_REQUEST_TIMEOUT_MS },
    );
    try {
      const store = createS3ObjectStore({ client, requestTimeoutMs: REQUEST_TIMEOUT_MS });

      await expect(store.head('contract-bucket', 'object.pdf')).resolves.toMatchObject({
        etag: '"etag"',
      });
    } finally {
      client.destroy();
      warn.mockRestore();
    }
  });
});

const SDK_RETRY_WINDOW_MS = LOCAL_ANSWER_DELAY_MS * 2;
const SINGLE_ATTEMPT = 1;

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function deadlineClient(endpoint: DelayingEndpoint, maxAttempts?: number): S3Client {
  return createS3Client(
    { ...CONFIG, endpoint: endpoint.url, forcePathStyle: true },
    {
      connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
      requestTimeoutMs: LOCAL_REQUEST_TIMEOUT_MS,
      enforceRequestTimeout: true,
      ...(maxAttempts === undefined ? {} : { maxAttempts }),
    },
  );
}

async function sendCopy(client: S3Client): Promise<unknown> {
  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: COPY_INPUT.bucket,
        Key: COPY_INPUT.destinationKey,
        CopySource: `${COPY_INPUT.bucket}/${COPY_INPUT.sourceKey}`,
        CopySourceIfMatch: COPY_INPUT.etag,
      }),
    );
    return undefined;
  } catch (error) {
    return error;
  } finally {
    client.destroy();
  }
}

describe('s3 client attempts', () => {
  it('retries a timed-out request on its own when the client keeps the default attempts', async () => {
    const endpoint = await startDelayingEndpoint(LOCAL_ANSWER_DELAY_MS);

    expect(await sendCopy(deadlineClient(endpoint))).toMatchObject({ name: 'TimeoutError' });
    await waitFor(SDK_RETRY_WINDOW_MS);

    expect(endpoint.requestCount()).toBeGreaterThan(SINGLE_ATTEMPT);
  });

  it('sends one request in total when a single-attempt client is cut at its deadline', async () => {
    const endpoint = await startDelayingEndpoint(LOCAL_ANSWER_DELAY_MS);

    expect(await sendCopy(deadlineClient(endpoint, SINGLE_ATTEMPT))).toMatchObject({
      name: 'TimeoutError',
    });
    await waitFor(SDK_RETRY_WINDOW_MS);

    expect(endpoint.requestCount()).toBe(SINGLE_ATTEMPT);
  });

  it('retries a server error on its own when the client keeps the default attempts', async () => {
    const endpoint = await startDelayingEndpoint(0, SERVER_ERROR_STATUS);

    expect(await sendCopy(deadlineClient(endpoint))).toMatchObject({
      $metadata: { httpStatusCode: SERVER_ERROR_STATUS },
    });

    expect(endpoint.requestCount()).toBeGreaterThan(SINGLE_ATTEMPT);
  });

  it('sends one request in total when a single-attempt client gets a server error', async () => {
    const endpoint = await startDelayingEndpoint(0, SERVER_ERROR_STATUS);

    expect(await sendCopy(deadlineClient(endpoint, SINGLE_ATTEMPT))).toMatchObject({
      $metadata: { httpStatusCode: SERVER_ERROR_STATUS },
    });
    await waitFor(SDK_RETRY_WINDOW_MS);

    expect(endpoint.requestCount()).toBe(SINGLE_ATTEMPT);
  });

  it('stops the client retrying a copy once the copy deadline has passed', async () => {
    const endpoint = await startDelayingEndpoint(LOCAL_ANSWER_DELAY_MS);
    const client = deadlineClient(endpoint);
    try {
      const store = createS3ObjectStore({
        client,
        requestTimeoutMs: LOCAL_REQUEST_TIMEOUT_MS,
        copyTimeoutMs: LOCAL_REQUEST_TIMEOUT_MS,
      });

      await expect(store.copyIfMatch(COPY_INPUT)).rejects.toBeInstanceOf(ObjectStorageTimeoutError);
      await waitFor(SDK_RETRY_WINDOW_MS);

      expect(endpoint.requestCount()).toBe(SINGLE_ATTEMPT);
    } finally {
      client.destroy();
    }
  });
});

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

  it('adds no signed header and no upload header when no encryption is configured', async () => {
    const store = createS3ObjectStore({
      client: createFakeS3Endpoint(CONFIG).client,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      region: 'us-east-1',
    });

    const presigned = await store.presignPut(PRESIGN_INPUT);
    const signedHeaders =
      new URL(presigned.url).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];

    expect(presigned.headers).toEqual({});
    expect([...signedHeaders].sort()).toEqual(['content-length', 'content-type', 'host']);
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

  it('leaves a copy unbounded by the adapter when no copy deadline is given', async () => {
    vi.useFakeTimers();
    try {
      const { client } = createFakeS3Endpoint(CONFIG);
      Object.defineProperty(client, 'send', {
        value: () => new Promise(() => {}),
        writable: true,
      });
      const store = createS3ObjectStore({ client, requestTimeoutMs: REQUEST_TIMEOUT_MS });

      let settled = false;
      void store
        .copyIfMatch(COPY_INPUT)
        .catch(() => undefined)
        .finally(() => {
          settled = true;
        });
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 4);

      expect(settled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a copy at its own deadline when the host never answers', async () => {
    vi.useFakeTimers();
    try {
      const { client } = createFakeS3Endpoint(CONFIG);
      Object.defineProperty(client, 'send', {
        value: () => new Promise(() => {}),
        writable: true,
      });
      const store = createS3ObjectStore({
        client,
        requestTimeoutMs: COPY_DEADLINE_MS,
        copyTimeoutMs: COPY_DEADLINE_MS,
      });

      const pending = store.copyIfMatch(COPY_INPUT);
      const assertion = expect(pending).rejects.toBeInstanceOf(ObjectStorageTimeoutError);
      await vi.advanceTimersByTimeAsync(COPY_DEADLINE_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a copy outlive the ordinary request deadline when its own deadline is longer', async () => {
    vi.useFakeTimers();
    try {
      const endpoint = createFakeS3Endpoint(CONFIG);
      const answer = endpoint.client.send.bind(endpoint.client) as (
        command: unknown,
      ) => Promise<unknown>;
      const store = createS3ObjectStore({
        client: endpoint.client,
        requestTimeoutMs: COPY_DEADLINE_MS,
        copyTimeoutMs: COPY_DEADLINE_MS,
      });
      await store.put({
        bucket: COPY_INPUT.bucket,
        key: COPY_INPUT.sourceKey,
        body: new Uint8Array([1, 2, 3]),
        contentType: 'application/pdf',
      });
      const etag = (await store.head(COPY_INPUT.bucket, COPY_INPUT.sourceKey))?.etag ?? '';
      Object.defineProperty(endpoint.client, 'send', {
        value: (command: unknown) =>
          new Promise((resolve) => setTimeout(resolve, SLOW_COPY_MS)).then(() => answer(command)),
        writable: true,
      });

      const pending = store.copyIfMatch({ ...COPY_INPUT, etag });
      await vi.advanceTimersByTimeAsync(SLOW_COPY_MS);

      await expect(pending).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
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
