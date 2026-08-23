import { afterEach, describe, expect, it } from 'vitest';
import { getPresignedPrivateUploadUrl, getPresignedUploadUrl } from '../object-storage';

const ENV_KEYS = [
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'CLOUDFLARE_R2_PRIVATE_BUCKET_NAME',
  'CLOUDFLARE_R2_PUBLIC_BASE_URL',
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

afterEach(() => {
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
