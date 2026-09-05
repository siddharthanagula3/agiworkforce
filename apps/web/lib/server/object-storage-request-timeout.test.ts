import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createS3ObjectStore, type ObjectStore } from '@agiworkforce/object-storage';
import { OBJECT_STORAGE_REQUEST_TIMEOUT_MS } from './object-storage-timeouts';

const sendMock = vi.hoisted(() => vi.fn());
const storeMock = vi.hoisted(() => ({ current: null as ObjectStore | null }));

vi.mock('./object-storage-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./object-storage-runtime')>();
  return {
    ...actual,
    getObjectStore: () => storeMock.current,
  };
});

import { getPrivateObject, ObjectStorageTimeoutError } from './object-storage';

const ENV_KEYS = [
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'CLOUDFLARE_R2_PRIVATE_BUCKET_NAME',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const KEY = 'chat-attachments/user-abc/1700000000000_abcdefghijklm.png';

beforeEach(() => {
  process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = 'account';
  process.env['CLOUDFLARE_R2_ACCESS_KEY_ID'] = 'access';
  process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY'] = 'secret';
  process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'public-media';
  process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'private-media';
  sendMock.mockReset();
  storeMock.current = createS3ObjectStore({
    client: { send: sendMock } as never,
    requestTimeoutMs: OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.useRealTimers();
});

describe('object storage request timeout', () => {
  it('rejects at the configured deadline instead of hanging when the client never resolves', async () => {
    vi.useFakeTimers();
    sendMock.mockImplementation(() => new Promise(() => {}));

    const pending = getPrivateObject(KEY);
    const assertion = expect(pending).rejects.toBeInstanceOf(ObjectStorageTimeoutError);
    await vi.advanceTimersByTimeAsync(OBJECT_STORAGE_REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('resolves as soon as the client answers, without waiting for the deadline', async () => {
    sendMock.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      ContentType: 'image/png',
    });

    const startedAt = Date.now();
    await expect(getPrivateObject(KEY)).resolves.toEqual({
      data: Buffer.from([1, 2, 3]),
      contentType: 'image/png',
    });
    expect(Date.now() - startedAt).toBeLessThan(OBJECT_STORAGE_REQUEST_TIMEOUT_MS);
  });
});
