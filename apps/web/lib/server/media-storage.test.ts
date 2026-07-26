import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const putObject = vi.fn();
const getObject = vi.fn();
const deleteObject = vi.fn();
const isObjectStorageConfigured = vi.fn();
const mkdir = vi.fn();
const readFile = vi.fn();
const unlink = vi.fn();
const writeFile = vi.fn();

vi.mock('./object-storage', () => ({
  putObject: (...args: unknown[]) => putObject(...args),
  getObject: (...args: unknown[]) => getObject(...args),
  deleteObject: (...args: unknown[]) => deleteObject(...args),
  isObjectStorageConfigured: (...args: unknown[]) => isObjectStorageConfigured(...args),
}));
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: (...args: unknown[]) => mkdir(...args),
    readFile: (...args: unknown[]) => readFile(...args),
    unlink: (...args: unknown[]) => unlink(...args),
    writeFile: (...args: unknown[]) => writeFile(...args),
  },
  mkdir: (...args: unknown[]) => mkdir(...args),
  readFile: (...args: unknown[]) => readFile(...args),
  unlink: (...args: unknown[]) => unlink(...args),
  writeFile: (...args: unknown[]) => writeFile(...args),
}));

import {
  bytesFromBase64,
  storeMedia,
  isMediaStorageConfigured,
  readStoredMedia,
} from './media-storage';

describe('bytesFromBase64', () => {
  it('decodes a raw base64 string', () => {
    const buf = bytesFromBase64(Buffer.from('hello').toString('base64'));
    expect(buf.toString('utf8')).toBe('hello');
  });

  it('strips a data: URI prefix before decoding', () => {
    const b64 = Buffer.from('png-bytes').toString('base64');
    const buf = bytesFromBase64(`data:image/png;base64,${b64}`);
    expect(buf.toString('utf8')).toBe('png-bytes');
  });
});

describe('isMediaStorageConfigured', () => {
  afterEach(() => {
    isObjectStorageConfigured.mockReset();
    vi.unstubAllEnvs();
  });

  it('reflects the underlying object-storage configuration check', () => {
    vi.stubEnv('NODE_ENV', 'production');
    isObjectStorageConfigured.mockReturnValue(true);
    expect(isMediaStorageConfigured()).toBe(true);
    isObjectStorageConfigured.mockReturnValue(false);
    expect(isMediaStorageConfigured()).toBe(false);
  });

  it('enables the private filesystem fallback only in local development', () => {
    isObjectStorageConfigured.mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'development');
    expect(isMediaStorageConfigured()).toBe(true);
    vi.stubEnv('NODE_ENV', 'test');
    expect(isMediaStorageConfigured()).toBe(false);
  });
});

describe('storeMedia', () => {
  beforeEach(() => {
    putObject.mockReset();
    putObject.mockResolvedValue({ url: 'https://media.example/media/image/u1/x.png' });
    getObject.mockReset();
    deleteObject.mockReset();
    isObjectStorageConfigured.mockReset();
    isObjectStorageConfigured.mockReturnValue(true);
    mkdir.mockReset();
    readFile.mockReset();
    unlink.mockReset();
    writeFile.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uploads bytes to a user-scoped public key and returns the durable url', async () => {
    const data = Buffer.from('img');
    const result = await storeMedia({
      userId: 'user_123',
      kind: 'image',
      data,
      contentType: 'image/png',
    });

    expect(putObject).toHaveBeenCalledTimes(1);
    const [options] = putObject.mock.calls[0]!;
    expect(options.key).toMatch(/^media\/image\/user_123\/[0-9a-f-]+\.png$/);
    expect(options.data).toBe(data);
    expect(options.contentType).toBe('image/png');
    expect(result.url).toBe('https://media.example/media/image/u1/x.png');
    expect(result.byteSize).toBe(data.byteLength);
    expect(result.contentType).toBe('image/png');
  });

  it('derives the extension from the mime type (mp4 for video)', async () => {
    await storeMedia({
      userId: 'u',
      kind: 'video',
      data: Buffer.from('v'),
      contentType: 'video/mp4',
    });
    const [options] = putObject.mock.calls[0]!;
    expect(options.key).toMatch(/^media\/video\/u\/[0-9a-f-]+\.mp4$/);
  });

  it('stores and reads reload-safe media locally when R2 is absent in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    isObjectStorageConfigured.mockReturnValue(false);
    readFile.mockResolvedValue(Buffer.from('local-image'));

    const result = await storeMedia({
      userId: 'user_123',
      kind: 'image',
      data: Buffer.from('local-image'),
      contentType: 'image/png',
    });

    expect(result.pathname).toMatch(/^local-dev-media\/image\/[a-f0-9]{32}\/[0-9a-f-]{36}\.png$/);
    expect(result.url).toBe(result.pathname);
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.next/agi-local-media/image/'), {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.next/agi-local-media/image/'),
      Buffer.from('local-image'),
    );

    await expect(readStoredMedia(result.pathname)).resolves.toEqual({
      data: Buffer.from('local-image'),
      contentType: undefined,
    });
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('.next/agi-local-media/image/'));
    expect(putObject).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  it('rejects traversal-shaped local locators before touching the filesystem', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    isObjectStorageConfigured.mockReturnValue(false);

    await expect(readStoredMedia('local-dev-media/../../secret')).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });
});
