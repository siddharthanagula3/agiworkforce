import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const putObject = vi.fn();
const putPrivateObject = vi.fn();
const getObject = vi.fn();
const getPrivateObject = vi.fn();
const getObjectStream = vi.fn();
const getPrivateObjectStream = vi.fn();
const deleteObject = vi.fn();
const deletePrivateObject = vi.fn();
const isObjectStorageConfigured = vi.fn();
const isPrivateObjectStorageConfigured = vi.fn();
const mkdir = vi.fn();
const readFile = vi.fn();
const unlink = vi.fn();
const writeFile = vi.fn();
const copyFile = vi.fn();
const stat = vi.fn();
const createReadStream = vi.fn();

vi.mock('./object-storage', () => ({
  putObject: (...args: unknown[]) => putObject(...args),
  putPrivateObject: (...args: unknown[]) => putPrivateObject(...args),
  getObject: (...args: unknown[]) => getObject(...args),
  getPrivateObject: (...args: unknown[]) => getPrivateObject(...args),
  getObjectStream: (...args: unknown[]) => getObjectStream(...args),
  getPrivateObjectStream: (...args: unknown[]) => getPrivateObjectStream(...args),
  deleteObject: (...args: unknown[]) => deleteObject(...args),
  deletePrivateObject: (...args: unknown[]) => deletePrivateObject(...args),
  isObjectStorageConfigured: (...args: unknown[]) => isObjectStorageConfigured(...args),
  isPrivateObjectStorageConfigured: (...args: unknown[]) =>
    isPrivateObjectStorageConfigured(...args),
}));
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: (...args: unknown[]) => mkdir(...args),
    readFile: (...args: unknown[]) => readFile(...args),
    unlink: (...args: unknown[]) => unlink(...args),
    writeFile: (...args: unknown[]) => writeFile(...args),
    copyFile: (...args: unknown[]) => copyFile(...args),
    stat: (...args: unknown[]) => stat(...args),
  },
  mkdir: (...args: unknown[]) => mkdir(...args),
  readFile: (...args: unknown[]) => readFile(...args),
  unlink: (...args: unknown[]) => unlink(...args),
  writeFile: (...args: unknown[]) => writeFile(...args),
  copyFile: (...args: unknown[]) => copyFile(...args),
  stat: (...args: unknown[]) => stat(...args),
}));
vi.mock('node:fs', () => ({
  default: {
    createReadStream: (...args: unknown[]) => createReadStream(...args),
  },
  createReadStream: (...args: unknown[]) => createReadStream(...args),
}));

import {
  bytesFromBase64,
  storeMedia,
  storeMediaFile,
  isGeneratedMediaStorageConfigured,
  isImageStorageConfigured,
  isMediaStorageConfigured,
  isVideoStorageConfigured,
  readStoredMedia,
  streamStoredMedia,
  deleteStoredMedia,
  sealedChatAttachmentPathname,
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
    isPrivateObjectStorageConfigured.mockReset();
    vi.unstubAllEnvs();
  });

  it('keeps legacy public media readable but refuses public-only generated writes', () => {
    vi.stubEnv('NODE_ENV', 'production');
    isPrivateObjectStorageConfigured.mockReturnValue(false);
    isObjectStorageConfigured.mockReturnValue(true);
    expect(isMediaStorageConfigured()).toBe(true);
    expect(isGeneratedMediaStorageConfigured()).toBe(false);
    expect(isImageStorageConfigured()).toBe(false);
    isObjectStorageConfigured.mockReturnValue(false);
    isPrivateObjectStorageConfigured.mockReturnValue(false);
    expect(isMediaStorageConfigured()).toBe(false);
    expect(isGeneratedMediaStorageConfigured()).toBe(false);
    expect(isImageStorageConfigured()).toBe(false);
  });

  it('enables the private filesystem fallback only in local development', () => {
    isObjectStorageConfigured.mockReturnValue(false);
    vi.stubEnv('NODE_ENV', 'development');
    expect(isMediaStorageConfigured()).toBe(true);
    expect(isGeneratedMediaStorageConfigured()).toBe(true);
    expect(isImageStorageConfigured()).toBe(true);
    vi.stubEnv('NODE_ENV', 'test');
    expect(isMediaStorageConfigured()).toBe(false);
    expect(isGeneratedMediaStorageConfigured()).toBe(false);
    expect(isImageStorageConfigured()).toBe(false);
  });

  it('requires the private object backend for production video storage', () => {
    vi.stubEnv('NODE_ENV', 'production');
    isObjectStorageConfigured.mockReturnValue(true);
    isPrivateObjectStorageConfigured.mockReturnValue(false);
    expect(isMediaStorageConfigured()).toBe(true);
    expect(isVideoStorageConfigured()).toBe(false);

    isPrivateObjectStorageConfigured.mockReturnValue(true);
    expect(isGeneratedMediaStorageConfigured()).toBe(true);
    expect(isImageStorageConfigured()).toBe(true);
    expect(isVideoStorageConfigured()).toBe(true);
  });

  it('admits all generated media when only the private backend is configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    isObjectStorageConfigured.mockReturnValue(false);
    isPrivateObjectStorageConfigured.mockReturnValue(true);

    expect(isMediaStorageConfigured()).toBe(true);
    expect(isGeneratedMediaStorageConfigured()).toBe(true);
    expect(isImageStorageConfigured()).toBe(true);
    expect(isVideoStorageConfigured()).toBe(true);
  });
});

describe('storeMedia', () => {
  beforeEach(() => {
    putObject.mockReset();
    putObject.mockResolvedValue({ url: 'https://media.example/media/image/u1/x.png' });
    putPrivateObject.mockReset();
    putPrivateObject.mockResolvedValue({ key: 'private-key' });
    getObject.mockReset();
    getPrivateObject.mockReset();
    getObjectStream.mockReset();
    getPrivateObjectStream.mockReset();
    deleteObject.mockReset();
    deletePrivateObject.mockReset();
    isObjectStorageConfigured.mockReset();
    isObjectStorageConfigured.mockReturnValue(true);
    isPrivateObjectStorageConfigured.mockReset();
    isPrivateObjectStorageConfigured.mockReturnValue(true);
    mkdir.mockReset();
    readFile.mockReset();
    unlink.mockReset();
    writeFile.mockReset();
    copyFile.mockReset();
    stat.mockReset();
    createReadStream.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uploads generated images to an owner-scoped private key and returns no public locator', async () => {
    const data = Buffer.from('img');
    const result = await storeMedia({
      userId: 'user_123',
      kind: 'image',
      data,
      contentType: 'image/png',
    });

    expect(putPrivateObject).toHaveBeenCalledTimes(1);
    const [options] = putPrivateObject.mock.calls[0]!;
    expect(options.key).toMatch(/^private-media\/image\/[a-f0-9]{32}\/[0-9a-f-]{36}\.png$/);
    expect(options.data).toBe(data);
    expect(options.contentType).toBe('image/png');
    expect(result.url).toBe(options.key);
    expect(result.pathname).toBe(options.key);
    expect(result.byteSize).toBe(data.byteLength);
    expect(result.contentType).toBe('image/png');
    expect(putObject).not.toHaveBeenCalled();
  });

  it('stores buffered video only in the private bucket and exposes no public URL', async () => {
    const result = await storeMedia({
      userId: 'u',
      kind: 'video',
      data: Buffer.from('v'),
      contentType: 'video/mp4',
    });
    const [options] = putPrivateObject.mock.calls[0]!;
    expect(options.key).toMatch(/^private-media\/video\/[a-f0-9]{32}\/[0-9a-f-]{36}\.mp4$/);
    expect(result.url).toBe(options.key);
    expect(result.pathname).toBe(options.key);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('streams a validated video to one stable private object identity', async () => {
    const stream = { kind: 'read-stream' };
    stat.mockResolvedValue({ isFile: () => true, size: 16 });
    createReadStream.mockReturnValue(stream);

    const result = await storeMediaFile({
      userId: 'u',
      kind: 'video',
      filePath: '/tmp/provider-video',
      byteSize: 16,
      contentType: 'video/mp4',
      storageId: '11111111-1111-4111-8111-111111111111',
    });

    expect(putPrivateObject).toHaveBeenCalledWith({
      key: expect.stringMatching(
        /^private-media\/video\/[a-f0-9]{32}\/11111111-1111-4111-8111-111111111111\.mp4$/,
      ),
      data: stream,
      contentType: 'video/mp4',
      contentLength: 16,
    });
    expect(result.pathname).toMatch(
      /^private-media\/video\/[a-f0-9]{32}\/11111111-1111-4111-8111-111111111111\.mp4$/,
    );
    expect(result.url).toBe(result.pathname);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('fails production video persistence when only the public bucket is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    isPrivateObjectStorageConfigured.mockReturnValue(false);

    await expect(
      storeMedia({
        userId: 'u',
        kind: 'video',
        data: Buffer.from('v'),
        contentType: 'video/mp4',
      }),
    ).rejects.toThrow('Private media storage is not configured');
    expect(putObject).not.toHaveBeenCalled();
    expect(putPrivateObject).not.toHaveBeenCalled();
  });

  it('rejects a staged file whose actual size differs from the validated provider bytes', async () => {
    stat.mockResolvedValue({ isFile: () => true, size: 15 });

    await expect(
      storeMediaFile({
        userId: 'u',
        kind: 'video',
        filePath: '/tmp/provider-video',
        byteSize: 16,
        contentType: 'video/mp4',
        storageId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('does not match its validated size');
    expect(putObject).not.toHaveBeenCalled();
  });

  it('stores and reads reload-safe media locally when R2 is absent in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    isObjectStorageConfigured.mockReturnValue(false);
    isPrivateObjectStorageConfigured.mockReturnValue(false);
    readFile.mockResolvedValue(Buffer.from('local-image'));

    const result = await storeMedia({
      userId: 'user_123',
      kind: 'image',
      data: Buffer.from('local-image'),
      contentType: 'image/png',
    });

    expect(result.pathname).toMatch(/^local-dev-media\/image\/[a-f0-9]{32}\/[0-9a-f-]{36}\.png$/);
    expect(result.url).toBe(result.pathname);
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.agi-local-media/image/'), {
      recursive: true,
    });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.agi-local-media/image/'),
      Buffer.from('local-image'),
    );

    await expect(readStoredMedia(result.pathname)).resolves.toEqual({
      data: Buffer.from('local-image'),
      contentType: undefined,
    });
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('.agi-local-media/image/'));
    expect(readFile).not.toHaveBeenCalledWith(expect.stringContaining('.next/'));
    expect(putObject).not.toHaveBeenCalled();
    expect(putPrivateObject).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  it('rejects traversal-shaped local locators before touching the filesystem', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    isObjectStorageConfigured.mockReturnValue(false);

    await expect(readStoredMedia('local-dev-media/../../secret')).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reads, ranges, and deletes private video only through the private bucket', async () => {
    const pathname =
      'private-media/video/0123456789abcdef0123456789abcdef/11111111-1111-4111-8111-111111111111.mp4';
    const body = new ReadableStream<Uint8Array>();
    getPrivateObject.mockResolvedValue({ data: Buffer.from('private'), contentType: 'video/mp4' });
    getPrivateObjectStream.mockResolvedValue({
      body,
      contentType: 'video/mp4',
      contentLength: 4,
      contentRange: 'bytes 2-5/100',
    });

    await expect(readStoredMedia(pathname)).resolves.toEqual({
      data: Buffer.from('private'),
      contentType: 'video/mp4',
    });
    await expect(streamStoredMedia(pathname, { start: 2, end: 5 })).resolves.toEqual({
      body,
      contentType: 'video/mp4',
      contentLength: 4,
      contentRange: 'bytes 2-5/100',
    });
    await deleteStoredMedia(pathname);

    expect(getPrivateObject).toHaveBeenCalledWith(pathname);
    expect(getPrivateObjectStream).toHaveBeenCalledWith(pathname, 'bytes=2-5');
    expect(deletePrivateObject).toHaveBeenCalledWith(pathname);
    expect(getObject).not.toHaveBeenCalled();
    expect(getObjectStream).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('reads and deletes chat attachments through the private bucket with a legacy public fallback', async () => {
    const pathname = 'chat-attachments/user-abc/1700000000000_abcdefghijklm.txt';
    getPrivateObject.mockResolvedValueOnce({
      data: Buffer.from('private attachment'),
      contentType: 'text/plain',
    });

    await expect(readStoredMedia(pathname)).resolves.toEqual({
      data: Buffer.from('private attachment'),
      contentType: 'text/plain',
    });
    expect(getObject).not.toHaveBeenCalled();

    getPrivateObject.mockResolvedValueOnce(null);
    getObject.mockResolvedValueOnce({
      data: Buffer.from('legacy attachment'),
      contentType: 'text/plain',
    });
    await expect(readStoredMedia(pathname)).resolves.toEqual({
      data: Buffer.from('legacy attachment'),
      contentType: 'text/plain',
    });

    await deleteStoredMedia(pathname);
    expect(deletePrivateObject).toHaveBeenCalledWith(pathname);
    expect(deleteObject).toHaveBeenCalledWith(pathname);
  });

  /**
   * The suite above used the presigned key. The upload route stores the sealed
   * one, and nothing exercised that shape - so a guard that accepted a single
   * extension shipped against keys that carry two, and every completed
   * attachment became unreadable while its bytes sat in the bucket.
   */
  it('reads the sealed pathname the upload route actually stores', async () => {
    const pathname = sealedChatAttachmentPathname(
      'chat-attachments/user-abc/1700000000000_abcdefghijklm.png',
    );
    expect(pathname).toBe('chat-attachments/user-abc/1700000000000_abcdefghijklm.png.scanned');
    getPrivateObject.mockResolvedValueOnce({
      data: Buffer.from('sealed attachment'),
      contentType: 'image/png',
    });

    await expect(readStoredMedia(pathname)).resolves.toEqual({
      data: Buffer.from('sealed attachment'),
      contentType: 'image/png',
    });
    expect(getPrivateObject).toHaveBeenCalledWith(pathname);

    getPrivateObjectStream.mockResolvedValueOnce({
      body: new ReadableStream<Uint8Array>(),
      contentType: 'image/png',
      contentLength: 17,
    });
    await expect(streamStoredMedia(pathname)).resolves.toMatchObject({ contentLength: 17 });

    await deleteStoredMedia(pathname);
    expect(deletePrivateObject).toHaveBeenCalledWith(pathname);
  });

  it('still refuses a chat-attachment pathname that is not one the upload route minted', async () => {
    for (const pathname of [
      'chat-attachments/user-abc/1700000000000_abcdefghijklm.png.scanned.scanned',
      'chat-attachments/user-abc/1700000000000_abcdefghijklm.png.evil',
      'chat-attachments/user-abc/../../private-media/file/secret.pdf.scanned',
      'chat-attachments/user-abc/notatimestamp.png.scanned',
      'chat-attachments/.scanned',
    ]) {
      await expect(readStoredMedia(pathname)).resolves.toBeNull();
      await expect(deleteStoredMedia(pathname)).rejects.toThrow(
        'Invalid private chat-attachment storage path.',
      );
    }
    expect(getPrivateObject).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
    expect(deletePrivateObject).not.toHaveBeenCalled();
  });

  it('reads, ranges, and deletes generated images and files only through the private bucket', async () => {
    const pathname =
      'private-media/file/0123456789abcdef0123456789abcdef/11111111-1111-4111-8111-111111111111.pdf';
    const body = new ReadableStream<Uint8Array>();
    getPrivateObject.mockResolvedValue({
      data: Buffer.from('private'),
      contentType: 'application/pdf',
    });
    getPrivateObjectStream.mockResolvedValue({
      body,
      contentType: 'application/pdf',
      contentLength: 4,
      contentRange: 'bytes 2-5/100',
    });

    await expect(readStoredMedia(pathname)).resolves.toEqual({
      data: Buffer.from('private'),
      contentType: 'application/pdf',
    });
    await expect(streamStoredMedia(pathname, { start: 2, end: 5 })).resolves.toEqual({
      body,
      contentType: 'application/pdf',
      contentLength: 4,
      contentRange: 'bytes 2-5/100',
    });
    await deleteStoredMedia(pathname);

    expect(getPrivateObject).toHaveBeenCalledWith(pathname);
    expect(getPrivateObjectStream).toHaveBeenCalledWith(pathname, 'bytes=2-5');
    expect(deletePrivateObject).toHaveBeenCalledWith(pathname);
    expect(getObject).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
