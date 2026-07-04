import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const putObject = vi.fn();
const deleteObject = vi.fn();
const isObjectStorageConfigured = vi.fn();
vi.mock('./object-storage', () => ({
  putObject: (...args: unknown[]) => putObject(...args),
  deleteObject: (...args: unknown[]) => deleteObject(...args),
  isObjectStorageConfigured: (...args: unknown[]) => isObjectStorageConfigured(...args),
}));

import { bytesFromBase64, storeMedia, isMediaStorageConfigured } from './media-storage';

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
  });

  it('reflects the underlying object-storage configuration check', () => {
    isObjectStorageConfigured.mockReturnValue(true);
    expect(isMediaStorageConfigured()).toBe(true);
    isObjectStorageConfigured.mockReturnValue(false);
    expect(isMediaStorageConfigured()).toBe(false);
  });
});

describe('storeMedia', () => {
  beforeEach(() => {
    putObject.mockReset();
    putObject.mockResolvedValue({ url: 'https://media.example/media/image/u1/x.png' });
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
});
