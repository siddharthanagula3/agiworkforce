import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObjectStore } from '@agiworkforce/object-storage';

const headMock = vi.hoisted(() => vi.fn());
const getStreamMock = vi.hoisted(() => vi.fn());

vi.mock('./object-storage-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./object-storage-runtime')>();
  const store: Pick<ObjectStore, 'head' | 'getStream'> = {
    head: headMock,
    getStream: getStreamMock,
  };
  return { ...actual, getObjectStore: () => store };
});

import { getBoundedPrivateObject, StoredObjectTooLargeError } from './object-storage';

const ENV_KEYS = [
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'CLOUDFLARE_R2_PRIVATE_BUCKET_NAME',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const KEY = 'chat-attachments/user-abc/1700000000000_abcdefghijklm.png';
const MAX_BYTES = 12 * 1024 * 1024;
const OVERSIZED_BYTES = 4 * 1024 * 1024 * 1024;

function webStreamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

beforeEach(() => {
  process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = 'account';
  process.env['CLOUDFLARE_R2_ACCESS_KEY_ID'] = 'access';
  process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY'] = 'secret';
  process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'public-media';
  process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'private-media';
  headMock.mockReset();
  getStreamMock.mockReset();
  getStreamMock.mockImplementation(() => {
    throw new Error('the stored bytes must not be read before the size check');
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('getBoundedPrivateObject', () => {
  it('refuses an object larger than the limit without ever fetching its bytes', async () => {
    headMock.mockResolvedValue({ contentLength: OVERSIZED_BYTES, contentType: 'image/png' });

    await expect(getBoundedPrivateObject(KEY, MAX_BYTES)).rejects.toBeInstanceOf(
      StoredObjectTooLargeError,
    );

    expect(headMock).toHaveBeenCalledTimes(1);
    expect(getStreamMock).not.toHaveBeenCalled();
  });

  it('refuses an object whose size the store does not report', async () => {
    headMock.mockResolvedValue({ contentType: 'image/png' });

    await expect(getBoundedPrivateObject(KEY, MAX_BYTES)).rejects.toBeInstanceOf(
      StoredObjectTooLargeError,
    );
    expect(getStreamMock).not.toHaveBeenCalled();
  });

  it('aborts a stream that outgrows the limit after a truthful head response', async () => {
    headMock.mockResolvedValue({ contentLength: 8, contentType: 'text/plain' });
    getStreamMock.mockResolvedValue({
      body: webStreamOf([new Uint8Array(8), new Uint8Array(8)]),
      contentType: 'text/plain',
      contentLength: 8,
      contentRange: undefined,
    });

    await expect(getBoundedPrivateObject(KEY, 8)).rejects.toBeInstanceOf(StoredObjectTooLargeError);
  });

  it('returns the bytes of an object within the limit', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    headMock.mockResolvedValue({
      contentLength: bytes.byteLength,
      contentType: 'image/png',
      etag: '"abc"',
    });
    getStreamMock.mockResolvedValue({
      body: webStreamOf([bytes]),
      contentType: 'image/png',
      contentLength: bytes.byteLength,
      contentRange: undefined,
    });

    await expect(getBoundedPrivateObject(KEY, MAX_BYTES)).resolves.toEqual({
      data: Buffer.from(bytes),
      contentType: 'image/png',
      etag: '"abc"',
    });
  });

  it('returns null when the object is missing', async () => {
    headMock.mockResolvedValue(null);

    await expect(getBoundedPrivateObject(KEY, MAX_BYTES)).resolves.toBeNull();
    expect(getStreamMock).not.toHaveBeenCalled();
  });
});
