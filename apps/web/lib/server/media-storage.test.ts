import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const put = vi.fn();
const del = vi.fn();
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => put(...args),
  del: (...args: unknown[]) => del(...args),
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
  const original = process.env['BLOB_READ_WRITE_TOKEN'];
  afterEach(() => {
    if (original === undefined) delete process.env['BLOB_READ_WRITE_TOKEN'];
    else process.env['BLOB_READ_WRITE_TOKEN'] = original;
  });

  it('reflects presence of the blob token', () => {
    process.env['BLOB_READ_WRITE_TOKEN'] = 'vercel_blob_rw_test';
    expect(isMediaStorageConfigured()).toBe(true);
    delete process.env['BLOB_READ_WRITE_TOKEN'];
    expect(isMediaStorageConfigured()).toBe(false);
  });
});

describe('storeMedia', () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({ url: 'https://blob.example/media/image/u1/x.png' });
  });

  it('uploads bytes to a user-scoped public path and returns the durable url', async () => {
    const data = Buffer.from('img');
    const result = await storeMedia({
      userId: 'user_123',
      kind: 'image',
      data,
      contentType: 'image/png',
    });

    expect(put).toHaveBeenCalledTimes(1);
    const [pathname, body, options] = put.mock.calls[0]!;
    expect(pathname).toMatch(/^media\/image\/user_123\/[0-9a-f-]+\.png$/);
    expect(body).toBe(data);
    expect(options).toMatchObject({ access: 'public', contentType: 'image/png' });
    expect(result.url).toBe('https://blob.example/media/image/u1/x.png');
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
    const [pathname] = put.mock.calls[0]!;
    expect(pathname).toMatch(/^media\/video\/u\/[0-9a-f-]+\.mp4$/);
  });
});
