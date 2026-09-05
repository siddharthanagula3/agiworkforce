import { describe, expect, it } from 'vitest';
import {
  hasObjectStorageCredentials,
  objectStorageUploadOrigins,
  resolveObjectStorageConfig,
} from '../config';
import { ObjectStorageConfigError } from '../types';

const R2_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';

const R2_ENVIRONMENT = {
  CLOUDFLARE_R2_ACCOUNT_ID: R2_ACCOUNT_ID,
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'r2-access',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'r2-secret',
  CLOUDFLARE_R2_BUCKET_NAME: 'agiworkforce-media',
  CLOUDFLARE_R2_PRIVATE_BUCKET_NAME: 'agiworkforce-media-private',
  CLOUDFLARE_R2_PUBLIC_BASE_URL: 'https://assets.example.test',
};

describe('resolveObjectStorageConfig', () => {
  it('reads the neutral names first', () => {
    const config = resolveObjectStorageConfig({
      AGI_STORAGE_ENDPOINT: 'https://minio.example.test:9000',
      AGI_STORAGE_REGION: 'us-east-1',
      AGI_STORAGE_BUCKET: 'media',
      AGI_STORAGE_PRIVATE_BUCKET: 'media-private',
      AGI_STORAGE_ACCESS_KEY_ID: 'neutral-access',
      AGI_STORAGE_SECRET_ACCESS_KEY: 'neutral-secret',
      AGI_STORAGE_PUBLIC_BASE_URL: 'https://cdn.example.test',
      AGI_STORAGE_FORCE_PATH_STYLE: 'true',
    });

    expect(config).toMatchObject({
      provider: 's3',
      endpoint: 'https://minio.example.test:9000',
      region: 'us-east-1',
      forcePathStyle: true,
      accessKeyId: 'neutral-access',
      secretAccessKey: 'neutral-secret',
      publicBucket: 'media',
      privateBucket: 'media-private',
      publicBaseUrl: 'https://cdn.example.test',
    });
  });

  it('falls back to the cloudflare names so an existing deployment keeps working', () => {
    const config = resolveObjectStorageConfig(R2_ENVIRONMENT);

    expect(config).toMatchObject({
      provider: 's3',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: 'auto',
      forcePathStyle: false,
      accessKeyId: 'r2-access',
      secretAccessKey: 'r2-secret',
      publicBucket: 'agiworkforce-media',
      privateBucket: 'agiworkforce-media-private',
      publicBaseUrl: 'https://assets.example.test',
    });
  });

  it('prefers a neutral name over the cloudflare name it shadows', () => {
    const config = resolveObjectStorageConfig({
      ...R2_ENVIRONMENT,
      AGI_STORAGE_ENDPOINT: 'https://s3.example.test',
      AGI_STORAGE_BUCKET: 'neutral-media',
    });

    expect(config.endpoint).toBe('https://s3.example.test');
    expect(config.publicBucket).toBe('neutral-media');
    expect(config.privateBucket).toBe('agiworkforce-media-private');
  });

  it('derives no endpoint from an account id that is not the shape cloudflare issues', () => {
    const config = resolveObjectStorageConfig({
      ...R2_ENVIRONMENT,
      CLOUDFLARE_R2_ACCOUNT_ID: 'evil.example.com',
    });

    expect(config.endpoint).toBeUndefined();
    expect(config.provider).toBe('none');
    expect(hasObjectStorageCredentials(config)).toBe(false);
  });

  it('reports no provider when nothing is configured', () => {
    expect(resolveObjectStorageConfig({}).provider).toBe('none');
  });

  it('lets an explicit provider override what the credentials imply', () => {
    expect(
      resolveObjectStorageConfig({ ...R2_ENVIRONMENT, AGI_STORAGE_PROVIDER: 'memory' }).provider,
    ).toBe('memory');
  });

  it('refuses a provider name it cannot serve', () => {
    expect(() => resolveObjectStorageConfig({ AGI_STORAGE_PROVIDER: 'dropbox' })).toThrow(
      ObjectStorageConfigError,
    );
  });
});

describe('objectStorageUploadOrigins', () => {
  it('names one virtual-host origin per configured bucket', () => {
    expect(objectStorageUploadOrigins(resolveObjectStorageConfig(R2_ENVIRONMENT))).toEqual([
      `https://agiworkforce-media.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      `https://agiworkforce-media-private.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    ]);
  });

  it('collapses to the endpoint origin when the host addresses buckets by path', () => {
    expect(
      objectStorageUploadOrigins(
        resolveObjectStorageConfig({
          AGI_STORAGE_ENDPOINT: 'http://minio.example.test:9000',
          AGI_STORAGE_ACCESS_KEY_ID: 'access',
          AGI_STORAGE_SECRET_ACCESS_KEY: 'secret',
          AGI_STORAGE_BUCKET: 'media',
          AGI_STORAGE_PRIVATE_BUCKET: 'media-private',
          AGI_STORAGE_FORCE_PATH_STYLE: '1',
        }),
      ),
    ).toEqual(['http://minio.example.test:9000']);
  });

  it('refuses a bucket name that is not a single dns label', () => {
    expect(
      objectStorageUploadOrigins(
        resolveObjectStorageConfig({
          ...R2_ENVIRONMENT,
          CLOUDFLARE_R2_BUCKET_NAME: 'bucket.attacker.example',
          CLOUDFLARE_R2_PRIVATE_BUCKET_NAME: '',
        }),
      ),
    ).toEqual([]);
  });

  it('names nothing when no endpoint is configured', () => {
    expect(objectStorageUploadOrigins(resolveObjectStorageConfig({}))).toEqual([]);
  });
});
