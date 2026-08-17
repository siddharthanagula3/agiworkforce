import { afterEach, describe, expect, it } from 'vitest';
import {
  getPresignedPrivateUploadUrl,
  isPrivateObjectStorageConfigured,
  objectKeyFromPublicUrl,
} from './object-storage';

const ENV_KEYS = [
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'CLOUDFLARE_R2_PRIVATE_BUCKET_NAME',
  'CLOUDFLARE_R2_PUBLIC_BASE_URL',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('private object-storage configuration', () => {
  it('requires credentials and a bucket distinct from the public bucket', () => {
    process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = 'account';
    process.env['CLOUDFLARE_R2_ACCESS_KEY_ID'] = 'access';
    process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY'] = 'secret';
    process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'public-media';
    process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'private-video';

    expect(isPrivateObjectStorageConfigured()).toBe(true);

    process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'public-media';
    expect(isPrivateObjectStorageConfigured()).toBe(false);

    delete process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'];
    expect(isPrivateObjectStorageConfigured()).toBe(false);
  });
});

describe('getPresignedPrivateUploadUrl', () => {
  function configureR2(): void {
    process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = 'account';
    process.env['CLOUDFLARE_R2_ACCESS_KEY_ID'] = 'access';
    process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY'] = 'secret';
    process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'public-media';
    process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'private-media';
  }

  it('signs the content length so an oversized body cannot be stored at the key', async () => {
    configureR2();

    const { uploadUrl } = await getPresignedPrivateUploadUrl({
      key: 'chat-attachments/user-abc/object.png',
      contentType: 'image/png',
      contentLength: 1234,
    });

    const signedHeaders =
      new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
    expect(signedHeaders).toContain('content-length');
  });

  it('refuses to presign an upload with no bound on its size', async () => {
    configureR2();

    await expect(
      getPresignedPrivateUploadUrl({
        key: 'chat-attachments/user-abc/object.png',
        contentType: 'image/png',
        contentLength: 0,
      }),
    ).rejects.toThrow('positive content length');
  });
});

describe('objectKeyFromPublicUrl', () => {
  it('returns the exact object key under the configured public base', () => {
    process.env['CLOUDFLARE_R2_PUBLIC_BASE_URL'] = 'https://files.example.test/assets';

    expect(
      objectKeyFromPublicUrl(
        'https://files.example.test/assets/knowledge-files/projects/project-1/object.txt',
      ),
    ).toBe('knowledge-files/projects/project-1/object.txt');
  });

  it('rejects lookalike origins, credentials, queries, fragments, and traversal', () => {
    process.env['CLOUDFLARE_R2_PUBLIC_BASE_URL'] = 'https://files.example.test/assets';

    for (const value of [
      'https://files.example.test.evil/assets/knowledge-files/file.txt',
      'https://user@files.example.test/assets/knowledge-files/file.txt',
      'https://files.example.test/assets/knowledge-files/file.txt?download=1',
      'https://files.example.test/assets/knowledge-files/file.txt#fragment',
      'https://files.example.test/assets/knowledge-files/%2e%2e/file.txt',
      'https://files.example.test/assets/knowledge-files\\..\\file.txt',
    ]) {
      expect(objectKeyFromPublicUrl(value), value).toBeNull();
    }
  });
});
