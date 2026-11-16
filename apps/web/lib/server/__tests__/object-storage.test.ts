// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyPrivateObjectIfUnchanged,
  getPresignedPrivateDownloadUrl,
  getPresignedPrivateUploadUrl,
  getBoundedPrivateObject,
  getPresignedUploadUrl,
  ObjectStorageTimeoutError,
  StoredObjectTooLargeError,
} from '../object-storage';
import {
  OBJECT_STORAGE_COPY_BASE_TIMEOUT_MS,
  OBJECT_STORAGE_COPY_TIMEOUT_STEP_BYTES,
  OBJECT_STORAGE_COPY_TIMEOUT_STEP_MS,
  OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
  objectStorageCopyTimeoutMs,
} from '../object-storage-timeouts';
import { getObjectStore } from '../object-storage-runtime';

const ENV_KEYS = [
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'CLOUDFLARE_R2_PRIVATE_BUCKET_NAME',
  'CLOUDFLARE_R2_PUBLIC_BASE_URL',
  'AGI_STORAGE_PROVIDER',
  'AGI_STORAGE_ENDPOINT',
  'AGI_STORAGE_FORCE_PATH_STYLE',
  'AGI_STORAGE_RETRY_BASE_DELAY_MS',
  'AGI_STORAGE_RETRY_MAX_ATTEMPTS',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function configureR2(): void {
  process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = 'account';
  process.env['CLOUDFLARE_R2_ACCESS_KEY_ID'] = 'access';
  process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY'] = 'secret';
  process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'public-media';
  process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'private-media';
  process.env['CLOUDFLARE_R2_PUBLIC_BASE_URL'] = 'https://assets.example.com';
}

function signedHeadersOf(uploadUrl: string): string[] {
  return new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
}

const PRIVATE_BUCKET = 'private-media';
const STAGING_KEY = 'chat-attachments/user-abc/1700000000000_abcdefghijklm.pdf';
const SEALED_KEY = `${STAGING_KEY}.scanned`;
const STAGING_ETAG = '"staging-etag"';
const LARGE_COPY_STEPS = 50;
const SLOW_COPY_MS = OBJECT_STORAGE_REQUEST_TIMEOUT_MS + 1_000;
const SHORT_DEADLINE_MS = 250;
const SHORT_DEADLINE_DELAY_MS = 2_000;
const LONG_TEST_TIMEOUT_MS = SLOW_COPY_MS * 3;

interface CopyRequest {
  path: string;
  copySource: string | undefined;
  ifMatch: string | undefined;
}

interface DelayingStorageEndpoint {
  url: string;
  copies: CopyRequest[];
  setDelay(delayMs: number): void;
  close(): Promise<void>;
}

const openEndpoints: DelayingStorageEndpoint[] = [];

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, delayMs)));
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function startDelayingStorageEndpoint(): Promise<DelayingStorageEndpoint> {
  const copies: CopyRequest[] = [];
  let delayMs = 0;
  const server: Server = createServer((request, response) => {
    request.resume();
    const copySource = headerValue(request.headers['x-amz-copy-source']);
    const ifMatch = headerValue(request.headers['x-amz-copy-source-if-match']);
    if (request.method === 'PUT' && copySource) {
      copies.push({
        path: new URL(request.url ?? '/', 'http://storage.test').pathname,
        copySource,
        ifMatch,
      });
    }
    const timer = setTimeout(() => {
      if (response.destroyed) return;
      if (ifMatch !== STAGING_ETAG) {
        response.writeHead(412, { 'Content-Type': 'application/xml' });
        response.end(
          '<?xml version="1.0" encoding="UTF-8"?><Error><Code>PreconditionFailed</Code><Message>At least one of the pre-conditions you specified did not hold</Message></Error>',
        );
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end(
        `<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult><ETag>${STAGING_ETAG}</ETag><LastModified>2026-11-15T00:00:00.000Z</LastModified></CopyObjectResult>`,
      );
    }, delayMs);
    response.on('close', () => clearTimeout(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const endpoint: DelayingStorageEndpoint = {
    url: `http://127.0.0.1:${port}`,
    copies,
    setDelay: (next) => {
      delayMs = next;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  openEndpoints.push(endpoint);
  return endpoint;
}

async function configureLocalStorage(): Promise<DelayingStorageEndpoint> {
  configureR2();
  const endpoint = await startDelayingStorageEndpoint();
  process.env['AGI_STORAGE_ENDPOINT'] = endpoint.url;
  process.env['AGI_STORAGE_FORCE_PATH_STYLE'] = 'true';
  return endpoint;
}

afterEach(async () => {
  await Promise.all(openEndpoints.splice(0).map((endpoint) => endpoint.close()));
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('presigned upload content-type binding', () => {
  it('signs the content type for public bucket uploads so an avatar cannot be stored as HTML', async () => {
    configureR2();

    const { uploadUrl } = await getPresignedUploadUrl({
      key: 'avatars/user-abc/pic.png',
      contentType: 'image/png',
      contentLength: 4096,
    });

    const url = new URL(uploadUrl);
    expect(signedHeadersOf(uploadUrl)).toContain('content-type');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });

  it('signs the content type for private bucket uploads', async () => {
    configureR2();

    const { uploadUrl } = await getPresignedPrivateUploadUrl({
      key: 'chat-attachments/user-abc/object.pdf',
      contentType: 'application/pdf',
      contentLength: 4096,
    });

    expect(signedHeadersOf(uploadUrl)).toContain('content-type');
  });

  it('refuses to presign an upload with no content type to bind', async () => {
    configureR2();

    await expect(
      getPresignedUploadUrl({
        key: 'avatars/user-abc/pic.png',
        contentType: '   ',
        contentLength: 4096,
      }),
    ).rejects.toThrow('must bind a content type');
  });
});

describe('presigned private download', () => {
  it('signs the content type it is given next to the attachment disposition', async () => {
    configureR2();

    const url = new URL(
      await getPresignedPrivateDownloadUrl({
        key: SEALED_KEY,
        fileName: 'report.pdf',
        expiresInSeconds: 300,
        contentType: 'application/octet-stream',
      }),
    );

    expect(url.searchParams.get('response-content-type')).toBe('application/octet-stream');
    expect(url.searchParams.get('response-content-disposition')).toMatch(/^attachment;/u);
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });

  it('signs no content type when its caller names none', async () => {
    configureR2();

    const url = new URL(
      await getPresignedPrivateDownloadUrl({
        key: 'exports/user-abc/archive.zip',
        fileName: 'archive.zip',
        expiresInSeconds: 300,
      }),
    );

    expect(url.searchParams.has('response-content-type')).toBe(false);
    expect(url.searchParams.get('response-content-disposition')).toMatch(/^attachment;/u);
  });
});

describe('copy deadline', () => {
  it('grows from the base by one step for every step of bytes, rounding up', () => {
    expect(objectStorageCopyTimeoutMs(0)).toBe(OBJECT_STORAGE_COPY_BASE_TIMEOUT_MS);
    expect(objectStorageCopyTimeoutMs(1)).toBe(
      OBJECT_STORAGE_COPY_BASE_TIMEOUT_MS + OBJECT_STORAGE_COPY_TIMEOUT_STEP_MS,
    );
    expect(
      objectStorageCopyTimeoutMs(OBJECT_STORAGE_COPY_TIMEOUT_STEP_BYTES * LARGE_COPY_STEPS),
    ).toBe(
      OBJECT_STORAGE_COPY_BASE_TIMEOUT_MS + OBJECT_STORAGE_COPY_TIMEOUT_STEP_MS * LARGE_COPY_STEPS,
    );
  });

  it('refuses a byte count that is negative or not whole', () => {
    expect(() => objectStorageCopyTimeoutMs(-1)).toThrow(RangeError);
    expect(() => objectStorageCopyTimeoutMs(1.5)).toThrow(RangeError);
    expect(() => objectStorageCopyTimeoutMs(Number.NaN)).toThrow(RangeError);
  });
});

describe('private copy if unchanged', () => {
  it('copies through the shared store when no deadline is given', async () => {
    const endpoint = await configureLocalStorage();

    await expect(
      copyPrivateObjectIfUnchanged({
        sourceKey: STAGING_KEY,
        destinationKey: SEALED_KEY,
        etag: STAGING_ETAG,
      }),
    ).resolves.toBe(true);
    await expect(
      copyPrivateObjectIfUnchanged({
        sourceKey: STAGING_KEY,
        destinationKey: SEALED_KEY,
        etag: '"changed"',
      }),
    ).resolves.toBe(false);

    expect(endpoint.copies.map((copy) => copy.path)).toEqual([
      `/${PRIVATE_BUCKET}/${SEALED_KEY}`,
      `/${PRIVATE_BUCKET}/${SEALED_KEY}`,
    ]);
    expect(endpoint.copies[0]?.copySource).toBe(`${PRIVATE_BUCKET}/${STAGING_KEY}`);
  });

  it(
    'lets a long-deadline copy run past the ordinary request deadline',
    async () => {
      const endpoint = await configureLocalStorage();
      endpoint.setDelay(SLOW_COPY_MS);
      const timeoutMs = objectStorageCopyTimeoutMs(
        OBJECT_STORAGE_COPY_TIMEOUT_STEP_BYTES * LARGE_COPY_STEPS,
      );
      const sharedCopy = vi.spyOn(getObjectStore(), 'copyIfMatch');

      const startedAt = Date.now();
      await expect(
        copyPrivateObjectIfUnchanged({
          sourceKey: STAGING_KEY,
          destinationKey: SEALED_KEY,
          etag: STAGING_ETAG,
          timeoutMs,
        }),
      ).resolves.toBe(true);

      expect(sharedCopy).not.toHaveBeenCalled();
      expect(Date.now() - startedAt).toBeGreaterThan(OBJECT_STORAGE_REQUEST_TIMEOUT_MS);
      expect(endpoint.copies).toEqual([
        {
          path: `/${PRIVATE_BUCKET}/${SEALED_KEY}`,
          copySource: `${PRIVATE_BUCKET}/${STAGING_KEY}`,
          ifMatch: STAGING_ETAG,
        },
      ]);
    },
    LONG_TEST_TIMEOUT_MS,
  );

  it('ends a long-deadline copy at its deadline and does not retry it', async () => {
    const endpoint = await configureLocalStorage();
    endpoint.setDelay(SHORT_DEADLINE_DELAY_MS);

    const startedAt = Date.now();
    await expect(
      copyPrivateObjectIfUnchanged({
        sourceKey: STAGING_KEY,
        destinationKey: SEALED_KEY,
        etag: STAGING_ETAG,
        timeoutMs: SHORT_DEADLINE_MS,
      }),
    ).rejects.toBeInstanceOf(ObjectStorageTimeoutError);

    expect(Date.now() - startedAt).toBeLessThan(SHORT_DEADLINE_DELAY_MS);
    await waitFor(SHORT_DEADLINE_DELAY_MS - (Date.now() - startedAt));
    expect(endpoint.copies).toHaveLength(1);
  });

  it('ends a long-deadline copy at its deadline on the memory provider too', async () => {
    process.env['AGI_STORAGE_PROVIDER'] = 'memory';
    process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = PRIVATE_BUCKET;
    const store = getObjectStore();
    const copy = vi
      .spyOn(store, 'copyIfMatch')
      .mockImplementation(() => waitFor(SHORT_DEADLINE_DELAY_MS).then(() => true));
    try {
      const startedAt = Date.now();
      await expect(
        copyPrivateObjectIfUnchanged({
          sourceKey: STAGING_KEY,
          destinationKey: SEALED_KEY,
          etag: STAGING_ETAG,
          timeoutMs: SHORT_DEADLINE_MS,
        }),
      ).rejects.toBeInstanceOf(ObjectStorageTimeoutError);

      expect(Date.now() - startedAt).toBeLessThan(SHORT_DEADLINE_DELAY_MS);
      expect(copy).toHaveBeenCalledTimes(1);
    } finally {
      copy.mockRestore();
    }
  });

  it('answers false from a long-deadline copy whose source changed', async () => {
    const endpoint = await configureLocalStorage();

    await expect(
      copyPrivateObjectIfUnchanged({
        sourceKey: STAGING_KEY,
        destinationKey: SEALED_KEY,
        etag: '"changed"',
        timeoutMs: SHORT_DEADLINE_DELAY_MS,
      }),
    ).resolves.toBe(false);
    expect(endpoint.copies).toHaveLength(1);
  });

  it('refuses a deadline that is not a positive whole number of milliseconds', async () => {
    const endpoint = await configureLocalStorage();

    for (const timeoutMs of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
      await expect(
        copyPrivateObjectIfUnchanged({
          sourceKey: STAGING_KEY,
          destinationKey: SEALED_KEY,
          etag: STAGING_ETAG,
          timeoutMs,
        }),
      ).rejects.toThrow(RangeError);
    }
    expect(endpoint.copies).toHaveLength(0);
  });
});

describe('bounded private read', () => {
  const BOUNDED_KEY = 'chat-attachments/user-abc/bounded.txt';
  const BODY = Buffer.from('the whole body of the stored file');
  const MAX_BYTES = BODY.byteLength * 2;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function failingBody(error: Error): ReadableStream<Uint8Array> {
    let sent = false;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(BODY.subarray(0, 5));
          return;
        }
        controller.error(error);
      },
    });
  }

  function connectionReset(): Error {
    return Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  }

  async function storeWithBody() {
    process.env['AGI_STORAGE_PROVIDER'] = 'memory';
    process.env['AGI_STORAGE_RETRY_BASE_DELAY_MS'] = '0';
    configureR2();
    const store = getObjectStore();
    await store.put({
      bucket: PRIVATE_BUCKET,
      key: BOUNDED_KEY,
      body: BODY,
      contentType: 'text/plain',
    });
    return store;
  }

  it('reads a body that arrives whole', async () => {
    await storeWithBody();

    const object = await getBoundedPrivateObject(BOUNDED_KEY, MAX_BYTES);

    expect(object?.data.equals(BODY)).toBe(true);
    expect(object?.contentType).toBe('text/plain');
  });

  it('opens the stream again when the body fails part way, then returns the whole body', async () => {
    const store = await storeWithBody();
    const realGetStream = store.getStream.bind(store);
    const getStream = vi
      .spyOn(store, 'getStream')
      .mockImplementationOnce(async (bucket, key, range) => {
        const stream = await realGetStream(bucket, key, range);
        return stream ? { ...stream, body: failingBody(connectionReset()) } : null;
      });

    const object = await getBoundedPrivateObject(BOUNDED_KEY, MAX_BYTES);

    expect(getStream).toHaveBeenCalledTimes(2);
    expect(object?.data.equals(BODY)).toBe(true);
  });

  it('stops after the policy attempts when every body fails part way', async () => {
    const store = await storeWithBody();
    process.env['AGI_STORAGE_RETRY_MAX_ATTEMPTS'] = '2';
    const realGetStream = store.getStream.bind(store);
    const getStream = vi
      .spyOn(store, 'getStream')
      .mockImplementation(async (bucket, key, range) => {
        const stream = await realGetStream(bucket, key, range);
        return stream ? { ...stream, body: failingBody(connectionReset()) } : null;
      });

    await expect(getBoundedPrivateObject(BOUNDED_KEY, MAX_BYTES)).rejects.toThrow('socket hang up');

    expect(getStream).toHaveBeenCalledTimes(2);
  });

  it('does not retry a body failure that is not a storage fault', async () => {
    const store = await storeWithBody();
    const realGetStream = store.getStream.bind(store);
    const getStream = vi
      .spyOn(store, 'getStream')
      .mockImplementation(async (bucket, key, range) => {
        const stream = await realGetStream(bucket, key, range);
        return stream ? { ...stream, body: failingBody(new Error('unreadable')) } : null;
      });

    await expect(getBoundedPrivateObject(BOUNDED_KEY, MAX_BYTES)).rejects.toThrow('unreadable');

    expect(getStream).toHaveBeenCalledTimes(1);
  });

  it('never retries a body that runs past the limit', async () => {
    const store = await storeWithBody();
    const realGetStream = store.getStream.bind(store);
    const getStream = vi
      .spyOn(store, 'getStream')
      .mockImplementation(async (bucket, key, range) => {
        const stream = await realGetStream(bucket, key, range);
        return stream
          ? {
              ...stream,
              body: new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new Uint8Array(MAX_BYTES + 1));
                  controller.close();
                },
              }),
            }
          : null;
      });

    await expect(getBoundedPrivateObject(BOUNDED_KEY, MAX_BYTES)).rejects.toBeInstanceOf(
      StoredObjectTooLargeError,
    );

    expect(getStream).toHaveBeenCalledTimes(1);
  });
});
