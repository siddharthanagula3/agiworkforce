import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

type ObjectStorageModule = typeof import('@/lib/server/object-storage');
type ObjectStorageRuntimeModule = typeof import('@/lib/server/object-storage-runtime');
type IdentityModule = typeof import('@/lib/server/identity');
type EmailModule = typeof import('@/lib/services/notification-email-service');
type JobServiceModule = typeof import('@/lib/jobs/job-service');
type MediaStorageModule = typeof import('@/lib/server/media-storage');

const mocks = vi.hoisted(() => ({
  emailConfigured: vi.fn(() => true),
  getIdentityUser: vi.fn(),
  enqueueJob: vi.fn(async () => ({ id: 'job-1' })),
  putPrivateObject: vi.fn(async () => undefined),
  deletePrivateObject: vi.fn(async () => undefined),
  getPrivateObjectStream: vi.fn(),
  streamStoredMedia: vi.fn(),
  sendDataExportReadyEmail: vi.fn(),
}));

const multipartStore = {
  createMultipartUpload: vi.fn(),
  uploadPart: vi.fn(),
  listUploadedParts: vi.fn(),
  completeMultipartUpload: vi.fn(),
  abortMultipartUpload: vi.fn(),
  listPendingMultipartUploads: vi.fn(),
  presignUploadPart: vi.fn(),
};

vi.mock('@/lib/server/object-storage', async (importOriginal) => ({
  ...(await importOriginal<ObjectStorageModule>()),
  isPrivateObjectStorageConfigured: () => true,
  putPrivateObject: mocks.putPrivateObject,
  deletePrivateObject: mocks.deletePrivateObject,
  getPrivateObjectStream: mocks.getPrivateObjectStream,
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<MediaStorageModule>()),
  streamStoredMedia: mocks.streamStoredMedia,
}));
vi.mock('@/lib/server/object-storage-runtime', async (importOriginal) => ({
  ...(await importOriginal<ObjectStorageRuntimeModule>()),
  getObjectStore: () => multipartStore,
  objectStorageConfig: () => ({ privateBucket: 'private-bucket' }),
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<IdentityModule>()),
  getIdentityUser: mocks.getIdentityUser,
}));
vi.mock('@/lib/services/notification-email-service', async (importOriginal) => ({
  ...(await importOriginal<EmailModule>()),
  isNotificationEmailConfigured: mocks.emailConfigured,
  sendDataExportReadyEmail: mocks.sendDataExportReadyEmail,
}));
vi.mock('@/lib/jobs/job-service', async (importOriginal) => ({
  ...(await importOriginal<JobServiceModule>()),
  enqueueJob: mocks.enqueueJob,
}));

import {
  buildDataExportArchiveVolume,
  readDataExportArchive,
  requestDataExportArchive,
  resolveDataExportDownload,
  sendDataExportReadyEmailJob,
} from './data-export-archive';
import type { JobHandlerContext } from '@/lib/jobs/job-drain';

const USER_ID = 'user_export';

function databaseWith(rows: unknown[][]): DatabaseAdapter {
  const query = vi.fn(async () => rows.shift() ?? []);
  const db = {
    query,
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
  };
  return db as unknown as DatabaseAdapter;
}

async function requestWith(db: DatabaseAdapter) {
  return requestDataExportArchive({
    db,
    userId: USER_ID,
    origin: 'https://agiworkforce.com',
    collect: async () => ({ account: { id: USER_ID } }),
  });
}

function enqueuedPayload(): Record<string, unknown> {
  const [, input] = mocks.enqueueJob.mock.calls[0] as unknown as [
    DatabaseAdapter,
    { payload: Record<string, unknown> },
  ];
  return input.payload;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.emailConfigured.mockReturnValue(true);
  mocks.getIdentityUser.mockResolvedValue({
    primaryEmail: 'reader@example.com',
    primaryEmailVerification: 'verified',
  });
});

describe('requestDataExportArchive delivery', () => {
  it('promises email when email is configured and the address is verified', async () => {
    const { archive, created } = await requestWith(databaseWith([[], []]));

    expect(created).toBe(true);
    expect(archive.delivery).toBe('email');
    expect(enqueuedPayload()['delivery']).toBe('email');
  });

  it('delivers in the app when transactional email is not configured', async () => {
    mocks.emailConfigured.mockReturnValue(false);

    const { archive } = await requestWith(databaseWith([[], []]));

    expect(archive.delivery).toBe('in_app');
    expect(enqueuedPayload()['delivery']).toBe('in_app');
    expect(mocks.getIdentityUser).not.toHaveBeenCalled();
  });

  it('delivers in the app when the address is not verified', async () => {
    mocks.getIdentityUser.mockResolvedValue({
      primaryEmail: 'reader@example.com',
      primaryEmailVerification: 'unverified',
    });

    const { archive } = await requestWith(databaseWith([[], []]));

    expect(archive.delivery).toBe('in_app');
  });

  it('delivers in the app when the account email cannot be checked', async () => {
    mocks.getIdentityUser.mockRejectedValue(new Error('identity provider down'));

    const { archive } = await requestWith(databaseWith([[], []]));

    expect(archive.delivery).toBe('in_app');
  });

  it('returns the delivery of an export already being prepared', async () => {
    const db = databaseWith([
      [
        {
          status: 'running',
          payload: {
            exportId: 'export-1',
            requestedAt: '2026-10-16T10:00:00.000Z',
            delivery: 'email',
          },
          result: null,
        },
      ],
    ]);

    const { archive, created } = await requestWith(db);

    expect(created).toBe(false);
    expect(archive).toMatchObject({ id: 'export-1', status: 'preparing', delivery: 'email' });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});

describe('requestDataExportArchive staging order', () => {
  it('does not stage an object when workspace discovery fails', async () => {
    const error = new Error('workspace lookup unavailable');
    const query = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(error);
    const db = { query } as unknown as DatabaseAdapter;

    await expect(requestWith(db)).rejects.toBe(error);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain('from organization_members');
    expect(mocks.putPrivateObject).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('collects data and discovers workspaces before staging and enqueueing', async () => {
    const order: string[] = [];
    const workspaceId = '00000000-0000-4000-8000-000000000001';
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        order.push('lock');
        return [];
      }
      if (sql.includes('from public.background_jobs')) {
        order.push('existing');
        return [];
      }
      expect(sql).toContain('from organization_members');
      order.push('workspaces');
      return [{ organization_id: workspaceId }];
    });
    const db = {
      query,
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
    } as unknown as DatabaseAdapter;
    const account = { account: { id: USER_ID } };
    mocks.putPrivateObject.mockImplementationOnce(async () => {
      order.push('put');
    });
    mocks.enqueueJob.mockImplementationOnce(async () => {
      order.push('enqueue');
      return { id: 'job-1' };
    });

    const { archive, created } = await requestDataExportArchive({
      db,
      userId: USER_ID,
      origin: 'https://agiworkforce.com',
      collect: async () => {
        order.push('collect');
        return account;
      },
    });

    expect(order).toEqual([
      'existing',
      'collect',
      'workspaces',
      'put',
      'lock',
      'existing',
      'enqueue',
    ]);
    expect(created).toBe(true);
    expect(mocks.putPrivateObject).toHaveBeenCalledOnce();
    expect(mocks.putPrivateObject).toHaveBeenCalledWith({
      key: `exports/${USER_ID}/${archive.id}/export.json`,
      data: Buffer.from(JSON.stringify(account, null, 2)),
      contentType: 'application/json',
      contentLength: Buffer.byteLength(JSON.stringify(account, null, 2)),
    });
    expect(mocks.enqueueJob).toHaveBeenCalledOnce();
    expect(enqueuedPayload()).toMatchObject({
      exportId: archive.id,
      workspaces: [null, workspaceId],
      volume: 1,
      cursor: null,
      volumes: [],
    });
  });

  it('does not enqueue a build when staging rejects', async () => {
    const error = new Error('storage acknowledgment unavailable');
    mocks.putPrivateObject.mockRejectedValueOnce(error);

    await expect(requestWith(databaseWith([[], []]))).rejects.toBe(error);

    expect(mocks.putPrivateObject).toHaveBeenCalledOnce();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});

describe('requestDataExportArchive concurrent admission', () => {
  it('returns the export another request admitted first and drops its own staging', async () => {
    const admitted = {
      status: 'queued',
      payload: {
        exportId: 'export-first',
        requestedAt: '2026-11-08T10:00:00.000Z',
        delivery: 'in_app',
      },
      result: null,
    };
    const db = databaseWith([[], [], [], [admitted]]);

    const { archive, created } = await requestWith(db);

    expect(created).toBe(false);
    expect(archive).toMatchObject({ id: 'export-first', status: 'preparing' });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    expect(mocks.deletePrivateObject).toHaveBeenCalledOnce();
    expect(mocks.deletePrivateObject).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^exports/${USER_ID}/[^/]+/export\\.json$`)),
    );
  });

  it('serializes admission per account before it enqueues', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql.includes('pg_advisory_xact_lock') ? 'lock' : 'read');
      return [];
    });
    const db = {
      query,
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
    } as unknown as DatabaseAdapter;
    mocks.enqueueJob.mockImplementationOnce(async () => {
      statements.push('enqueue');
      return { id: 'job-1' };
    });

    await requestWith(db);

    expect(statements.slice(-3)).toEqual(['lock', 'read', 'enqueue']);
  });
});

describe('readDataExportArchive delivery', () => {
  it('reads an export requested before delivery was recorded as in-app', async () => {
    const db = databaseWith([
      [
        {
          status: 'queued',
          payload: { exportId: 'export-0', requestedAt: '2026-10-01T10:00:00.000Z' },
          result: null,
        },
      ],
    ]);

    await expect(readDataExportArchive(db, USER_ID)).resolves.toMatchObject({
      id: 'export-0',
      status: 'preparing',
      delivery: 'in_app',
    });
  });
});

describe('completed archive timestamp validation', () => {
  const now = Date.parse('2026-11-05T12:00:00.000Z');
  const exportId = 'export-timestamps';
  const key = `exports/${USER_ID}/${exportId}/agi-export-part-1.zip`;

  function completedJob(overrides: Record<string, unknown> = {}) {
    return {
      status: 'succeeded',
      payload: { exportId, requestedAt: '2026-11-05T11:00:00.000Z', workspaces: [null] },
      result: {
        done: true,
        readyAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 60_000).toISOString(),
        volumes: [{ volume: 1, key, byteCount: 1024, fileCount: 2 }],
        ...overrides,
      },
    };
  }

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { field: 'expiresAt', value: 'not-a-date' },
    { field: 'readyAt', value: 'not-a-date' },
    { field: 'expiresAt', value: '' },
    { field: 'readyAt', value: '' },
    { field: 'expiresAt', value: ' \t ' },
    { field: 'readyAt', value: ' \t ' },
    { field: 'expiresAt', value: null },
    { field: 'readyAt', value: undefined },
    { field: 'expiresAt', value: now + 60_000 },
    { field: 'readyAt', value: now - 60_000 },
  ])('rejects malformed $field metadata: $value', async ({ field, value }) => {
    const row = completedJob({ [field]: value });
    const db = databaseWith([[row], [row]]);

    await expect(readDataExportArchive(db, USER_ID, exportId)).resolves.toMatchObject({
      status: 'expired',
      volumes: [],
    });
    await expect(resolveDataExportDownload(db, USER_ID, exportId, 1)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it.each([now - 1, now])('refuses expiry at or before now: %s', async (expiry) => {
    const row = completedJob({ expiresAt: new Date(expiry).toISOString() });
    const db = databaseWith([[row], [row]]);

    await expect(readDataExportArchive(db, USER_ID, exportId)).resolves.toMatchObject({
      status: 'expired',
      volumes: [],
    });
    await expect(resolveDataExportDownload(db, USER_ID, exportId, 1)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('keeps a valid unexpired archive downloadable', async () => {
    const row = completedJob();
    const db = databaseWith([[row], [row]]);

    await expect(readDataExportArchive(db, USER_ID, exportId)).resolves.toMatchObject({
      status: 'ready',
      volumes: [expect.objectContaining({ volume: 1, byteCount: 1024, fileCount: 2 })],
    });
    await expect(resolveDataExportDownload(db, USER_ID, exportId, 1)).resolves.toEqual({
      key,
      fileName: 'agi-export-2026-11-05.zip',
    });
  });

  it.each([
    { status: 'queued', done: true, expected: 'preparing' },
    { status: 'running', done: true, expected: 'preparing' },
    { status: 'failed', done: true, expected: 'failed' },
    { status: 'succeeded', done: false, expected: 'preparing' },
  ])('preserves $status with done=$done', async ({ status, done, expected }) => {
    const row = { ...completedJob({ done, expiresAt: 'invalid' }), status };

    await expect(readDataExportArchive(databaseWith([[row]]), USER_ID)).resolves.toMatchObject({
      status: expected,
      volumes: [],
    });
  });
});

describe('latest export selection', () => {
  it('orders the account-wide status by request time before job creation time', async () => {
    const query = vi.fn(async () => []);
    const db = { query } as unknown as DatabaseAdapter;

    await readDataExportArchive(db, USER_ID);

    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toMatch(/order by payload->>'requestedAt' desc nulls last,\s*created_at desc/);
  });
});

describe('final volume expiry', () => {
  const exportId = 'export-retry';
  const recordedExpiry = new Date('2026-11-08T10:00:00.000Z');

  function finalVolumeContext(): JobHandlerContext {
    const tx = { query: vi.fn(async () => []), execute: vi.fn(async () => 0) };
    const query = vi.fn(async () => [{ run_after: recordedExpiry }]);
    const db = {
      query,
      transaction: async (callback: (inner: unknown) => Promise<unknown>) => callback(tx),
    } as unknown as DatabaseAdapter;
    return {
      db,
      signal: new AbortController().signal,
      isFinalAttempt: false,
      job: {
        userId: USER_ID,
        payload: {
          exportId,
          requestedAt: '2026-11-08T08:00:00.000Z',
          origin: 'https://agiworkforce.com',
          delivery: 'email',
          workspaces: [null],
          volume: 1,
          cursor: {
            workspace: 0,
            phase: 'projects',
            afterId: '00000000-0000-4000-8000-000000000001',
          },
          volumes: [],
        },
      },
    } as unknown as JobHandlerContext;
  }

  beforeEach(() => {
    multipartStore.createMultipartUpload.mockResolvedValue({ bucket: 'private-bucket', key: 'k' });
    multipartStore.uploadPart.mockResolvedValue({ partNumber: 1, etag: 'etag' });
    multipartStore.completeMultipartUpload.mockResolvedValue(undefined);
  });

  it('publishes the deadline of the expiry job a prior attempt already queued', async () => {
    mocks.enqueueJob.mockResolvedValueOnce({ id: 'expiry-job', created: false });

    const result = await buildDataExportArchiveVolume(finalVolumeContext());

    expect(result['done']).toBe(true);
    expect(result['expiresAt']).toBe(recordedExpiry.toISOString());
    expect(Date.parse(String(result['readyAt']))).toBeLessThan(recordedExpiry.getTime());
  });

  it('computes the deadline from now when it queues the expiry job itself', async () => {
    mocks.enqueueJob.mockResolvedValueOnce({ id: 'expiry-job', created: true });
    const before = Date.now();

    const result = await buildDataExportArchiveVolume(finalVolumeContext());

    const [, expiryInput] = mocks.enqueueJob.mock.calls[0] as unknown as [
      unknown,
      { runAfter: Date },
    ];
    expect(result['expiresAt']).toBe(expiryInput.runAfter.toISOString());
    expect(Date.parse(String(result['readyAt']))).toBeGreaterThanOrEqual(before);
  });
});

describe('resumed export volume with unavailable files', () => {
  const WORK_LIMIT_PASSED_MS = 160_000;
  const rows = [1, 2, 3].map((n) => ({
    id: `00000000-0000-4000-8000-00000000010${n}`,
    kind: 'upload',
    mime_type: 'text/plain',
    byte_size: 10,
    storage_pathname: `library/${n}`,
    metadata: { filename: `file-${n}.txt` },
    created_at: '2026-11-01T00:00:00.000Z',
  }));

  function resumedVolumeContext(): JobHandlerContext {
    let served = false;
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (served || !sql.includes('from public.media_assets')) return [];
        served = true;
        return rows;
      }),
      execute: vi.fn(async () => 0),
    };
    const db = {
      transaction: async (callback: (inner: unknown) => Promise<unknown>) => callback(tx),
    } as unknown as DatabaseAdapter;
    return {
      db,
      signal: new AbortController().signal,
      isFinalAttempt: false,
      job: {
        userId: USER_ID,
        payload: {
          exportId: 'export-resumed',
          requestedAt: '2026-11-08T08:00:00.000Z',
          origin: 'https://agiworkforce.com',
          delivery: 'in_app',
          workspaces: [null],
          volume: 2,
          cursor: { workspace: 0, phase: 'library', afterId: null },
          volumes: [],
        },
      },
    } as unknown as JobHandlerContext;
  }

  beforeEach(() => {
    multipartStore.createMultipartUpload.mockResolvedValue({
      bucket: 'private-bucket',
      key: 'k',
      uploadId: 'upload-1',
    });
    multipartStore.uploadPart.mockResolvedValue({ partNumber: 1, etag: 'etag' });
    multipartStore.completeMultipartUpload.mockResolvedValue(undefined);
    mocks.streamStoredMedia.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checkpoints the cursor past unavailable files once the work limit has passed', async () => {
    const start = Date.now();
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(start)
      .mockReturnValue(start + WORK_LIMIT_PASSED_MS);

    const result = await buildDataExportArchiveVolume(resumedVolumeContext());

    expect(result).toEqual({ exportId: 'export-resumed', volume: 2, done: false });
    expect(mocks.enqueueJob).toHaveBeenCalledOnce();
    const [, next] = mocks.enqueueJob.mock.calls[0] as unknown as [
      unknown,
      { payload: { volume: number; cursor: { afterId: string } } },
    ];
    expect(next.payload.volume).toBe(3);
    expect(next.payload.cursor.afterId).toBe(rows[0]?.id);
    const uploaded = multipartStore.uploadPart.mock.calls.flatMap(([input]) =>
      (input as { body: Buffer }).body.toString('latin1'),
    );
    expect(uploaded.join('')).toContain('unavailable-files.json');
    expect(multipartStore.completeMultipartUpload).toHaveBeenCalledOnce();
  });
});

describe('sendDataExportReadyEmailJob', () => {
  function emailContext(archiveRow: Record<string, unknown>): JobHandlerContext {
    const tx = { query: vi.fn(async () => [archiveRow]), execute: vi.fn(async () => 0) };
    const db = {
      transaction: async (callback: (inner: unknown) => Promise<unknown>) => callback(tx),
    } as unknown as DatabaseAdapter;
    return {
      db,
      signal: new AbortController().signal,
      isFinalAttempt: false,
      job: {
        userId: USER_ID,
        payload: { exportId: 'export-mail', origin: 'https://agiworkforce.com' },
      },
    } as unknown as JobHandlerContext;
  }

  const payload = { exportId: 'export-mail', requestedAt: '2026-11-08T08:00:00.000Z' };

  it.each(['queued', 'running'])(
    'retries instead of settling when the build job is still %s',
    async (status) => {
      await expect(
        sendDataExportReadyEmailJob(emailContext({ status, payload, result: null })),
      ).rejects.toThrow(/retried/);

      expect(mocks.sendDataExportReadyEmail).not.toHaveBeenCalled();
    },
  );

  it('sends the email once the build job has settled as ready', async () => {
    mocks.sendDataExportReadyEmail.mockResolvedValue({ delivered: true });
    const row = {
      status: 'succeeded',
      payload,
      result: {
        done: true,
        readyAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        volumes: [{ volume: 1, key: 'exports/k.zip', byteCount: 10, fileCount: 1 }],
      },
    };

    await expect(sendDataExportReadyEmailJob(emailContext(row))).resolves.toEqual({
      delivered: true,
    });
  });

  it('still settles without retry when the build job failed', async () => {
    await expect(
      sendDataExportReadyEmailJob(emailContext({ status: 'dead', payload, result: null })),
    ).resolves.toEqual({ skipped: 'failed' });
  });
});
