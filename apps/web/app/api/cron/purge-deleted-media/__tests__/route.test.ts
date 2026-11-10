import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore } from '@agiworkforce/object-storage';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(() => true),
  query: vi.fn(),
  deleteStoredMediaObjects: vi.fn(),
  purgeDerivedRecords: vi.fn(),
  sweepFeedbackScreenshots: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
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
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => {
    const db = {
      query: (...args: unknown[]) => mocks.query(...args),
      transaction: (run: (tx: unknown) => unknown) => run(db),
    };
    return db;
  },
}));
vi.mock('@/lib/resources/purge-soft-deleted', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  purgeDerivedRecords: mocks.purgeDerivedRecords,
}));
vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: mocks.deleteStoredMediaObjects,
}));
vi.mock('@/lib/server/feedback-screenshot-cleanup', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  sweepAbandonedFeedbackScreenshots: mocks.sweepFeedbackScreenshots,
}));
vi.mock('@/lib/server/object-storage-runtime', () => ({
  getObjectStore: () => mocks.store.current,
  objectStorageConfig: () => mocks.config.current,
}));

import { logger } from '@/lib/logger';
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
  mocks.purgeDerivedRecords.mockResolvedValue(0);
  mocks.sweepFeedbackScreenshots.mockResolvedValue({ swept: 0, failed: 0, remaining: false });
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

describe('purge-deleted-media feedback screenshot sweep', () => {
  it('sweeps abandoned feedback screenshots and reports the result', async () => {
    mocks.sweepFeedbackScreenshots.mockResolvedValue({ swept: 3, failed: 1, remaining: true });

    const body = await (await GET(request())).json();

    expect(mocks.sweepFeedbackScreenshots).toHaveBeenCalledTimes(1);
    expect(body.feedbackScreenshots).toEqual({ swept: 3, failed: 1, remaining: true });
  });

  it('still purges deleted media when the screenshot sweep fails', async () => {
    mocks.sweepFeedbackScreenshots.mockRejectedValue(new Error('relation does not exist'));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'No expired media to purge',
      feedbackScreenshots: null,
    });
    expect(logger.error).toHaveBeenCalledWith(
      { error: 'relation does not exist' },
      'Abandoned feedback screenshot sweep failed',
    );
  });
});

const ORG = '11111111-1111-4111-8111-111111111111';

function primePurge(options: {
  candidates: Array<{
    id: string;
    storage_pathname: string | null;
    organization_id: string | null;
  }>;
  confirmed: Array<{ id: string; storage_pathname: string | null }>;
  onDelete?: () => unknown[];
}) {
  mocks.query.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/advisory/.test(text)) return [];
    if (/select count\(\*\)/.test(text)) return [{ count: 0 }];
    if (/for update of candidate/.test(text)) return options.confirmed;
    if (/select candidate\.id/.test(text)) return options.candidates;
    if (/delete from public\.media_assets/.test(text)) {
      return options.onDelete ? options.onDelete() : [{ id: 'asset-1', user_id: 'owner' }];
    }
    return [];
  });
}

describe('purge-deleted-media against a hold placed during the run', () => {
  it('shares the workspace hold-placement lock before any object is deleted', async () => {
    primePurge({
      candidates: [{ id: 'asset-1', storage_pathname: 'users/owner/a.bin', organization_id: ORG }],
      confirmed: [{ id: 'asset-1', storage_pathname: 'users/owner/a.bin' }],
    });
    mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 1, failedPathnames: [] });

    const body = await (await GET(request())).json();

    const lockCall = mocks.query.mock.calls.findIndex(([sql]) =>
      /pg_advisory_xact_lock_shared/.test(String(sql)),
    );
    expect(lockCall).toBeGreaterThanOrEqual(0);
    expect(mocks.query.mock.invocationCallOrder[lockCall]).toBeLessThan(
      mocks.deleteStoredMediaObjects.mock.invocationCallOrder[0] as number,
    );
    expect(body).toMatchObject({ candidates: 1, objectsDeleted: 1, purged: 1 });
  });

  it('writes one audit entry for what a workspace batch purged', async () => {
    primePurge({
      candidates: [{ id: 'asset-1', storage_pathname: 'users/owner/a.bin', organization_id: ORG }],
      confirmed: [{ id: 'asset-1', storage_pathname: 'users/owner/a.bin' }],
    });
    mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 1, failedPathnames: [] });

    await GET(request());

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'deleted_content_purged',
        organizationId: ORG,
        detail: expect.objectContaining({ resourceType: 'file', deleted: 1, count: 1 }),
      }),
    );
  });

  it('deletes no object for a candidate that a hold covers once the lock is held', async () => {
    primePurge({
      candidates: [{ id: 'asset-1', storage_pathname: 'users/owner/a.bin', organization_id: ORG }],
      confirmed: [],
    });

    const body = await (await GET(request())).json();

    expect(mocks.deleteStoredMediaObjects).not.toHaveBeenCalled();
    expect(body).toMatchObject({ candidates: 1, objectsDeleted: 0, purged: 0 });
  });

  it('takes no lock for a personal asset and still re-reads it for update', async () => {
    primePurge({
      candidates: [{ id: 'asset-1', storage_pathname: null, organization_id: null }],
      confirmed: [{ id: 'asset-1', storage_pathname: null }],
    });

    await GET(request());

    expect(mocks.query.mock.calls.some(([sql]) => /advisory/.test(String(sql)))).toBe(false);
    expect(
      mocks.query.mock.calls.some(([sql]) => /for update of candidate/.test(String(sql))),
    ).toBe(true);
  });

  it('reports what was already removed when a later step fails', async () => {
    primePurge({
      candidates: [{ id: 'asset-1', storage_pathname: 'users/owner/a.bin', organization_id: ORG }],
      confirmed: [{ id: 'asset-1', storage_pathname: 'users/owner/a.bin' }],
      onDelete: () => {
        throw new Error('connection reset');
      },
    });
    mocks.deleteStoredMediaObjects.mockResolvedValue({ deleted: 1, failedPathnames: [] });

    const response = await GET(request());

    expect(response.status).toBe(500);
    const [fields, message] = vi.mocked(logger.error).mock.calls.at(-1) as [
      Record<string, unknown>,
      string,
    ];
    expect(fields).toMatchObject({ error: 'connection reset', objectsDeleted: 1, rowsPurged: 0 });
    expect(message).not.toMatch(/nothing was purged/);
  });
});

type ImportedModule2 = typeof import('@/lib/security-audit');
type ImportedModule1 = typeof import('@/lib/resources/purge-soft-deleted');
type ImportedModule0 = typeof import('@/lib/server/feedback-screenshot-cleanup');
