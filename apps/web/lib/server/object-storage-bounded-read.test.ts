import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: class {
      readonly send = sendMock;
    },
  };
});

import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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
  sendMock.mockReset();
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
    sendMock.mockImplementation(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return { ContentLength: 4 * 1024 * 1024 * 1024, ContentType: 'image/png' };
      }
      throw new Error('the stored bytes must not be read before the size check');
    });

    await expect(getBoundedPrivateObject(KEY, 12 * 1024 * 1024)).rejects.toBeInstanceOf(
      StoredObjectTooLargeError,
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('refuses an object whose size the store does not report', async () => {
    sendMock.mockImplementation(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) return { ContentType: 'image/png' };
      throw new Error('the stored bytes must not be read before the size check');
    });

    await expect(getBoundedPrivateObject(KEY, 12 * 1024 * 1024)).rejects.toBeInstanceOf(
      StoredObjectTooLargeError,
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a stream that outgrows the limit after a truthful head response', async () => {
    sendMock.mockImplementation(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return { ContentLength: 8, ContentType: 'text/plain' };
      }
      return {
        Body: { transformToWebStream: () => webStreamOf([new Uint8Array(8), new Uint8Array(8)]) },
        ContentType: 'text/plain',
      };
    });

    await expect(getBoundedPrivateObject(KEY, 8)).rejects.toBeInstanceOf(StoredObjectTooLargeError);
  });

  it('returns the bytes of an object within the limit', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    sendMock.mockImplementation(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return { ContentLength: bytes.byteLength, ContentType: 'image/png' };
      }
      expect(command).toBeInstanceOf(GetObjectCommand);
      return {
        Body: { transformToWebStream: () => webStreamOf([bytes]) },
        ContentType: 'image/png',
      };
    });

    await expect(getBoundedPrivateObject(KEY, 12 * 1024 * 1024)).resolves.toEqual({
      data: Buffer.from(bytes),
      contentType: 'image/png',
    });
  });

  it('returns null when the object is missing', async () => {
    sendMock.mockImplementation(async () => {
      throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    });

    await expect(getBoundedPrivateObject(KEY, 12 * 1024 * 1024)).resolves.toBeNull();
  });
});
