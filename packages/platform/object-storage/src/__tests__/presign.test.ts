import { describe, expect, it } from 'vitest';
import { createMemoryObjectStore } from '../adapters/memory';
import { createS3ObjectStore } from '../adapters/s3';
import type { ObjectStorageConfig } from '../config';
import {
  bindPresignedUpload,
  isPresignedUrlExpired,
  presignedUrlExpiresAt,
  PRESIGNED_URL_MAX_TTL_SECONDS,
} from '../presign';
import { createFakeS3Endpoint } from './fake-s3-endpoint';

const BUCKET = 'contract-bucket';
const KEY = 'object.png';
const CONTENT_TYPE = 'image/png';
const CONTENT_LENGTH = 4_096;
const TTL_SECONDS = 300;
const NOW_MS = 1_700_000_000_000;
const MILLISECONDS_PER_SECOND = 1_000;
const REQUEST_TIMEOUT_MS = 5_000;

const CONFIG: ObjectStorageConfig = {
  provider: 's3',
  endpoint: 'https://objects.example.test',
  region: 'auto',
  forcePathStyle: false,
  accessKeyId: 'access-key-id',
  secretAccessKey: 'secret-access-key',
  publicBucket: BUCKET,
  privateBucket: 'contract-bucket-private',
  publicBaseUrl: 'https://assets.example.test',
  encryption: undefined,
};

function presignInput(expiresInSeconds: number) {
  return {
    bucket: BUCKET,
    key: KEY,
    contentType: CONTENT_TYPE,
    contentLength: CONTENT_LENGTH,
    expiresInSeconds,
  };
}

describe('presigned upload binding', () => {
  it('returns the lifetime it bound when the input is complete', () => {
    expect(bindPresignedUpload(presignInput(TTL_SECONDS))).toEqual({
      contentType: CONTENT_TYPE,
      contentLength: CONTENT_LENGTH,
      expiresInSeconds: TTL_SECONDS,
    });
  });

  it('refuses a lifetime that is absent, zero, fractional or past the ceiling', () => {
    expect(() => bindPresignedUpload(presignInput(0))).toThrow('must expire');
    expect(() => bindPresignedUpload(presignInput(-1))).toThrow('must expire');
    expect(() => bindPresignedUpload(presignInput(1.5))).toThrow('must expire');
    expect(() => bindPresignedUpload(presignInput(PRESIGNED_URL_MAX_TTL_SECONDS + 1))).toThrow(
      'may not outlive',
    );
    expect(() => bindPresignedUpload(presignInput(PRESIGNED_URL_MAX_TTL_SECONDS))).not.toThrow();
  });
});

describe('presigned url expiry', () => {
  it('rejects a memory upload url once its ttl has passed', async () => {
    const store = createMemoryObjectStore({
      uploadBaseUrl: 'https://uploads.example.test/local-object-upload',
      now: () => NOW_MS,
    });

    const url = await store.presignPut(presignInput(TTL_SECONDS));
    const expiresAt = NOW_MS + TTL_SECONDS * MILLISECONDS_PER_SECOND;

    expect(presignedUrlExpiresAt(url)).toBe(expiresAt);
    expect(isPresignedUrlExpired(url, expiresAt - 1)).toBe(false);
    expect(isPresignedUrlExpired(url, expiresAt)).toBe(true);
    expect(isPresignedUrlExpired(url, expiresAt + MILLISECONDS_PER_SECOND)).toBe(true);
  });

  it('rejects a signed s3 upload url once its ttl has passed', async () => {
    const store = createS3ObjectStore({
      client: createFakeS3Endpoint(CONFIG).client,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    });

    const url = await store.presignPut(presignInput(TTL_SECONDS));
    const expiresAt = presignedUrlExpiresAt(url);

    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe(String(TTL_SECONDS));
    expect(expiresAt).not.toBeNull();
    expect(isPresignedUrlExpired(url, (expiresAt as number) - 1)).toBe(false);
    expect(isPresignedUrlExpired(url, expiresAt as number)).toBe(true);
  });

  it('treats a url with no readable expiry as already expired', () => {
    expect(presignedUrlExpiresAt('https://assets.example.test/object.png')).toBeNull();
    expect(isPresignedUrlExpired('https://assets.example.test/object.png', NOW_MS)).toBe(true);
    expect(isPresignedUrlExpired('not a url', NOW_MS)).toBe(true);
  });
});
