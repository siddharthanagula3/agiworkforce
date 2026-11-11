import { afterEach, describe, expect, it } from 'vitest';
import {
  OBJECT_STORAGE_ENCRYPTION_ENV,
  OBJECT_STORAGE_ENCRYPTION_KEY_ID_ENV,
  OBJECT_STORAGE_PUBLIC_BASE_URL_ENV,
} from '@agiworkforce/object-storage';
import { assertUploadSendsSignedHeaders } from '@agiworkforce/cloud-contracts';
import { directUploadHeaders } from './direct-upload-headers';
import { getPresignedPrivateUploadUrl, getPresignedUploadUrl } from './object-storage';

const ENV_KEYS = [
  OBJECT_STORAGE_ENCRYPTION_ENV,
  OBJECT_STORAGE_ENCRYPTION_KEY_ID_ENV,
  OBJECT_STORAGE_PUBLIC_BASE_URL_ENV,
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'CLOUDFLARE_R2_PRIVATE_BUCKET_NAME',
  'CLOUDFLARE_R2_PUBLIC_BASE_URL',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const UPLOAD = {
  key: 'chat-attachments/user-abc/object.png',
  contentType: 'image/png',
  contentLength: 1234,
};

function configureStorage(encryption?: { algorithm: string; keyId?: string }): void {
  process.env['CLOUDFLARE_R2_ACCOUNT_ID'] = 'account';
  process.env['CLOUDFLARE_R2_ACCESS_KEY_ID'] = 'access';
  process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY'] = 'secret';
  process.env['CLOUDFLARE_R2_BUCKET_NAME'] = 'public-media';
  process.env['CLOUDFLARE_R2_PRIVATE_BUCKET_NAME'] = 'private-media';
  process.env['CLOUDFLARE_R2_PUBLIC_BASE_URL'] = 'https://assets.example.test';
  delete process.env[OBJECT_STORAGE_ENCRYPTION_ENV];
  delete process.env[OBJECT_STORAGE_ENCRYPTION_KEY_ID_ENV];
  if (encryption) {
    process.env[OBJECT_STORAGE_ENCRYPTION_ENV] = encryption.algorithm;
    if (encryption.keyId) process.env[OBJECT_STORAGE_ENCRYPTION_KEY_ID_ENV] = encryption.keyId;
  }
}

function signedHeaders(uploadUrl: string): string[] {
  return new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('a presigned upload under configured server-side encryption', () => {
  it.each([
    ['private', getPresignedPrivateUploadUrl],
    ['public', getPresignedUploadUrl],
  ])('signs and returns the configured encryption for the %s bucket', async (_bucket, presign) => {
    configureStorage({ algorithm: 'aws:kms', keyId: 'key-id' });

    const { uploadUrl, uploadHeaders } = await presign(UPLOAD);

    expect(uploadHeaders).toEqual({
      'x-amz-server-side-encryption': 'aws:kms',
      'x-amz-server-side-encryption-aws-kms-key-id': 'key-id',
    });
    expect(signedHeaders(uploadUrl)).toEqual(
      expect.arrayContaining([
        'content-length',
        'content-type',
        'x-amz-server-side-encryption',
        'x-amz-server-side-encryption-aws-kms-key-id',
      ]),
    );
  });

  it.each([
    ['private', getPresignedPrivateUploadUrl],
    ['public', getPresignedUploadUrl],
  ])(
    'adds nothing for the %s bucket when no encryption is configured',
    async (_bucket, presign) => {
      configureStorage();

      const { uploadUrl, uploadHeaders } = await presign(UPLOAD);

      expect(uploadHeaders).toEqual({});
      expect(
        signedHeaders(uploadUrl).filter((name) => name.startsWith('x-amz-server-side')),
      ).toEqual([]);
    },
  );

  it('follows a change of the configured encryption without a restart of the store', async () => {
    configureStorage();
    expect((await getPresignedPrivateUploadUrl(UPLOAD)).uploadHeaders).toEqual({});

    configureStorage({ algorithm: 'AES256' });
    expect((await getPresignedPrivateUploadUrl(UPLOAD)).uploadHeaders).toEqual({
      'x-amz-server-side-encryption': 'AES256',
    });
  });

  it('refuses a configured encryption the host does not offer instead of signing without it', async () => {
    configureStorage({ algorithm: 'rot13' });

    await expect(getPresignedPrivateUploadUrl(UPLOAD)).rejects.toThrow('not an encryption');
  });

  it('hands the browser headers that satisfy every header the url was signed with', async () => {
    configureStorage({ algorithm: 'aws:kms', keyId: 'key-id' });

    const { uploadUrl, uploadHeaders } = await getPresignedPrivateUploadUrl(UPLOAD);
    const sent = directUploadHeaders(UPLOAD.contentType, uploadHeaders);

    expect(() => assertUploadSendsSignedHeaders(uploadUrl, sent)).not.toThrow();
  });

  it('refuses an upload that leaves out the encryption headers the url was signed with', async () => {
    configureStorage({ algorithm: 'aws:kms', keyId: 'key-id' });

    const { uploadUrl } = await getPresignedPrivateUploadUrl(UPLOAD);

    expect(() =>
      assertUploadSendsSignedHeaders(uploadUrl, { 'Content-Type': UPLOAD.contentType }),
    ).toThrow('x-amz-server-side-encryption');
  });
});

describe('directUploadHeaders', () => {
  it('returns the content type alone when the host requires nothing more', () => {
    expect(directUploadHeaders('image/png', undefined)).toEqual({ 'Content-Type': 'image/png' });
    expect(directUploadHeaders('image/png', {})).toEqual({ 'Content-Type': 'image/png' });
  });

  it('adds the headers the host requires', () => {
    expect(directUploadHeaders('image/png', { 'x-amz-server-side-encryption': 'AES256' })).toEqual({
      'Content-Type': 'image/png',
      'x-amz-server-side-encryption': 'AES256',
    });
  });

  it.each(['Content-Type', 'content-type'])(
    'refuses a required header %s that would replace the signed content type',
    (name) => {
      expect(() => directUploadHeaders('image/png', { [name]: 'text/html' })).toThrow(
        'content type',
      );
    },
  );
});
