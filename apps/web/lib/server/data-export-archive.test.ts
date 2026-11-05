import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

type ObjectStorageModule = typeof import('@/lib/server/object-storage');
type ObjectStorageRuntimeModule = typeof import('@/lib/server/object-storage-runtime');
type IdentityModule = typeof import('@/lib/server/identity');
type EmailModule = typeof import('@/lib/services/notification-email-service');
type JobServiceModule = typeof import('@/lib/jobs/job-service');

const mocks = vi.hoisted(() => ({
  emailConfigured: vi.fn(() => true),
  getIdentityUser: vi.fn(),
  enqueueJob: vi.fn(async () => ({ id: 'job-1' })),
  putPrivateObject: vi.fn(async () => undefined),
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
  readDataExportArchive,
  requestDataExportArchive,
  resolveDataExportDownload,
} from './data-export-archive';

const USER_ID = 'user_export';

function databaseWith(rows: unknown[][]): DatabaseAdapter {
  const query = vi.fn(async () => rows.shift() ?? []);
  return { query } as unknown as DatabaseAdapter;
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
