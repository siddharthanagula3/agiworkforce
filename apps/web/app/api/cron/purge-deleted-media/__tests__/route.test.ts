import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore } from '@agiworkforce/object-storage';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(() => true),
  query: vi.fn(),
  deleteStoredMediaObjects: vi.fn(),
  store: {
    current: null as ReturnType<typeof createMemoryObjectStore> | null,
    clock: { now: 0 },
  },
  config: {
    current: {
      provider: 's3',
      endpoint: 'https://objects.example.test',
      region: 'auto',
      forcePathStyle: false,
      accessKeyId: 'access-key-id',
      secretAccessKey: 'secret-access-key',
      publicBucket: 'agi-public',
      privateBucket: 'agi-private',
      publicBaseUrl: 'https://assets.example.test',
      encryption: undefined,
    } as Record<string, unknown>,
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: mocks.deleteStoredMediaObjects,
}));
vi.mock('@/lib/server/object-storage-runtime', () => ({
  getObjectStore: () => mocks.store.current,
  objectStorageConfig: () => mocks.config.current,
}));

import { GET } from '../route';

const DAY_MS = 24 * 60 * 60 * 1_000;

function request() {
  return new Request('http://localhost:3000/api/cron/purge-deleted-media') as never;
}

async function openStaleUpload(bucket: string, key: string): Promise<void> {
  const store = mocks.store.current;
  if (!store) throw new Error('The fake store was not primed.');
  const handle = await store.createMultipartUpload({
    bucket,
    key,
    contentType: 'video/mp4',
  });
  await store.uploadPart({ ...handle, partNumber: 1, body: new Uint8Array([1, 2, 3]) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.query.mockResolvedValue([]);
  mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 0, failedPathnames: [] });
  mocks.store.clock.now = Date.now();
  mocks.store.current = createMemoryObjectStore({ now: () => mocks.store.clock.now });
});

describe('purge-deleted-media orphan multipart sweep', () => {
  it('aborts a multipart upload nobody completed in either bucket', async () => {
    mocks.store.clock.now = Date.now() - 3 * DAY_MS;
    await openStaleUpload('agi-private', 'private-media/video/abandoned.mp4');
    await openStaleUpload('agi-public', 'media/video/abandoned.mp4');
    mocks.store.clock.now = Date.now();

    const body = await (await GET(request())).json();

    expect(body.multipart).toEqual({
      'agi-public': { supported: true, pending: 1, aborted: 1, failed: 0 },
      'agi-private': { supported: true, pending: 1, aborted: 1, failed: 0 },
    });
    expect(await mocks.store.current?.listPendingMultipartUploads('agi-private')).toEqual([]);
    expect(await mocks.store.current?.listPendingMultipartUploads('agi-public')).toEqual([]);
  });

  it('leaves an upload that is still in progress open', async () => {
    await openStaleUpload('agi-private', 'private-media/video/in-flight.mp4');

    const body = await (await GET(request())).json();

    expect(body.multipart['agi-private']).toEqual({
      supported: true,
      pending: 1,
      aborted: 0,
      failed: 0,
    });
    expect(await mocks.store.current?.listPendingMultipartUploads('agi-private')).toHaveLength(1);
  });

  it('sweeps nothing when object storage has no credentials', async () => {
    mocks.config.current = { ...mocks.config.current, accessKeyId: undefined };

    const body = await (await GET(request())).json();

    expect(body.multipart).toEqual({});

    mocks.config.current = { ...mocks.config.current, accessKeyId: 'access-key-id' };
  });

  it('refuses an unauthorized cron request before touching storage', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
