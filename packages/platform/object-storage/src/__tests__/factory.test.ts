import { describe, expect, it } from 'vitest';
import { resolveObjectStorageConfig } from '../config';
import { resolveObjectStorageRuntime } from '../factory';
import { ObjectStorageConfigError, type ObjectStore } from '../types';
import { createFakeS3Endpoint } from './fake-s3-endpoint';

const TIMEOUTS = { connectionTimeoutMs: 1_000, requestTimeoutMs: 5_000 };
const R2_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const BUCKET = 'media';
const KEY = 'attachments/object.png';
const CONTENT_TYPE = 'image/png';
const BYTES = new Uint8Array([1, 2, 3]);

const R2_ENVIRONMENT = {
  CLOUDFLARE_R2_ACCOUNT_ID: R2_ACCOUNT_ID,
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'r2-access',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'r2-secret',
  CLOUDFLARE_R2_BUCKET_NAME: BUCKET,
};

const MINIO_ENVIRONMENT = {
  AGI_STORAGE_ENDPOINT: 'http://minio.example.test:9000',
  AGI_STORAGE_REGION: 'us-east-1',
  AGI_STORAGE_ACCESS_KEY_ID: 'minio-access',
  AGI_STORAGE_SECRET_ACCESS_KEY: 'minio-secret',
  AGI_STORAGE_BUCKET: BUCKET,
  AGI_STORAGE_FORCE_PATH_STYLE: '1',
};

async function exerciseStore(store: ObjectStore): Promise<void> {
  await store.put({ bucket: BUCKET, key: KEY, body: BYTES, contentType: CONTENT_TYPE });
  await store.get(BUCKET, KEY);
  await store.delete(BUCKET, KEY);
}

function runtimeFor(env: Record<string, string>): { store: ObjectStore; sent: string[] } {
  const endpoint = createFakeS3Endpoint(resolveObjectStorageConfig(env), TIMEOUTS);
  const runtime = resolveObjectStorageRuntime({
    env,
    timeouts: TIMEOUTS,
    client: endpoint.client,
  });
  if (!runtime.store) throw new Error('The runtime resolved no store.');
  return { store: runtime.store, sent: endpoint.sent };
}

describe('resolveObjectStorageRuntime', () => {
  it('sends the same calls to a cloudflare endpoint and a minio endpoint', async () => {
    const cloudflare = runtimeFor(R2_ENVIRONMENT);
    const minio = runtimeFor(MINIO_ENVIRONMENT);

    await exerciseStore(cloudflare.store);
    await exerciseStore(minio.store);

    expect(minio.sent).toEqual(cloudflare.sent);
    expect(cloudflare.sent).toEqual([
      `put ${BUCKET}/${KEY} ${CONTENT_TYPE}`,
      `get ${BUCKET}/${KEY}`,
      `delete ${BUCKET}/${KEY}`,
    ]);
  });

  it('addresses each host the way that host expects', () => {
    expect(resolveObjectStorageConfig(R2_ENVIRONMENT)).toMatchObject({
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: 'auto',
      forcePathStyle: false,
    });
    expect(resolveObjectStorageConfig(MINIO_ENVIRONMENT)).toMatchObject({
      endpoint: 'http://minio.example.test:9000',
      region: 'us-east-1',
      forcePathStyle: true,
    });
  });

  it('resolves the memory provider without any endpoint at all', async () => {
    const runtime = resolveObjectStorageRuntime({ env: { AGI_STORAGE_PROVIDER: 'memory' } });
    expect(runtime.provider).toBe('memory');
    await runtime.store?.put({
      bucket: BUCKET,
      key: KEY,
      body: BYTES,
      contentType: CONTENT_TYPE,
    });
    expect((await runtime.store?.get(BUCKET, KEY))?.contentType).toBe(CONTENT_TYPE);
  });

  it('resolves no store when nothing is configured', () => {
    const runtime = resolveObjectStorageRuntime({ env: {} });
    expect(runtime.provider).toBe('none');
    expect(runtime.store).toBeNull();
  });

  it('refuses the s3 provider without deadlines', () => {
    expect(() => resolveObjectStorageRuntime({ env: R2_ENVIRONMENT })).toThrow(
      ObjectStorageConfigError,
    );
  });
});
