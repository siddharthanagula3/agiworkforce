import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getObjectStore: vi.fn(),
  objectStorageConfig: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/object-storage-runtime', () => ({
  getObjectStore: mocks.getObjectStore,
  objectStorageConfig: mocks.objectStorageConfig,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
}));

import { MAX_CHAT_ATTACHMENT_BYTES } from '@agiworkforce/cloud-contracts';
import { createMemoryObjectStore } from '@agiworkforce/object-storage';

import { uploadObjectKey } from '@/lib/server/upload-keys';

import {
  isCrossRegionBackup,
  isObjectBackupConfigured,
  replicateObject,
  resolveObjectBackupTarget,
  BACKUP_ACCESS_KEY_ID_ENV,
  BACKUP_BUCKET_ENV,
  BACKUP_ENDPOINT_ENV,
  BACKUP_REGION_ENV,
  BACKUP_SECRET_ACCESS_KEY_ENV,
  OBJECT_BACKUP_MAX_BYTES,
} from '../object-backup';

const PRIMARY_BUCKET = 'agi-private';
const BACKUP_BUCKET = 'agi-private-backup';
const KEY = 'private-media/image/a/1.png';
const CHAT_KEY = uploadObjectKey('chat-attachment', { userId: 'user-1', fileName: 'a.pdf' });
const MEDIA_VIDEO_KEY = 'private-media/video/a/1.mp4';
const MIB = 1024 * 1024;
const BYTES = new Uint8Array([1, 2, 3, 4]);

const CONFIGURED = {
  [BACKUP_ENDPOINT_ENV]: 'https://backup.example.test',
  [BACKUP_REGION_ENV]: 'eu-central-1',
  [BACKUP_BUCKET_ENV]: BACKUP_BUCKET,
  [BACKUP_ACCESS_KEY_ID_ENV]: 'backup-access',
  [BACKUP_SECRET_ACCESS_KEY_ENV]: 'backup-secret',
};

function backupTarget() {
  return {
    store: createMemoryObjectStore(),
    bucket: BACKUP_BUCKET,
    region: 'eu-central-1',
    endpoint: 'https://backup.example.test',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.objectStorageConfig.mockReturnValue({
    provider: 's3',
    endpoint: 'https://primary.example.test',
    region: 'us-east-1',
    forcePathStyle: false,
    accessKeyId: 'primary',
    secretAccessKey: 'primary',
    publicBucket: 'agi-public',
    privateBucket: PRIMARY_BUCKET,
    publicBaseUrl: 'https://cdn.example.test',
  });
});

describe('object backup target', () => {
  it('is unconfigured until every backup credential is present', () => {
    expect(isObjectBackupConfigured({})).toBe(false);
    expect(isObjectBackupConfigured({ ...CONFIGURED, [BACKUP_BUCKET_ENV]: undefined })).toBe(false);
    expect(isObjectBackupConfigured(CONFIGURED)).toBe(true);
    expect(resolveObjectBackupTarget({})).toBeNull();
  });

  it('resolves a target from its own variables so the copy can live elsewhere', () => {
    const target = resolveObjectBackupTarget(CONFIGURED);

    expect(target?.bucket).toBe(BACKUP_BUCKET);
    expect(target?.region).toBe('eu-central-1');
    expect(target?.endpoint).toBe('https://backup.example.test');
  });

  it('calls a backup behind the primary endpoint and region what it is: not cross-region', () => {
    expect(isCrossRegionBackup(CONFIGURED)).toBe(true);
    expect(
      isCrossRegionBackup({
        ...CONFIGURED,
        [BACKUP_ENDPOINT_ENV]: 'https://primary.example.test',
        [BACKUP_REGION_ENV]: 'us-east-1',
      }),
    ).toBe(false);
  });
});

describe('object replication', () => {
  it('copies the bytes into the backup bucket under the same key', async () => {
    const source = createMemoryObjectStore();
    await source.put({ bucket: PRIMARY_BUCKET, key: KEY, body: BYTES, contentType: 'image/png' });
    const target = backupTarget();

    const result = await replicateObject(KEY, { source, target });

    expect(result).toEqual({ outcome: 'replicated', bytes: BYTES.byteLength });
    await expect(target.store.get(BACKUP_BUCKET, KEY)).resolves.toEqual({
      data: BYTES,
      contentType: 'image/png',
    });
  });

  it('does not re-upload an object the backup already holds at the same size', async () => {
    const source = createMemoryObjectStore();
    await source.put({ bucket: PRIMARY_BUCKET, key: KEY, body: BYTES, contentType: 'image/png' });
    const target = backupTarget();
    await target.store.put({
      bucket: BACKUP_BUCKET,
      key: KEY,
      body: BYTES,
      contentType: 'image/png',
    });

    await expect(replicateObject(KEY, { source, target })).resolves.toEqual({
      outcome: 'already-present',
      bytes: BYTES.byteLength,
    });
  });

  it('reports a source object that is gone instead of writing an empty copy', async () => {
    const target = backupTarget();

    await expect(
      replicateObject(KEY, { source: createMemoryObjectStore(), target }),
    ).resolves.toEqual({ outcome: 'missing-source', bytes: 0 });
  });

  it('refuses an object past the copy limit and says so', async () => {
    const source = {
      head: vi.fn(async () => ({
        contentLength: OBJECT_BACKUP_MAX_BYTES + 1,
        contentType: 'video/mp4',
        etag: 'x',
      })),
      get: vi.fn(),
    };
    const target = backupTarget();

    const result = await replicateObject(KEY, {
      source: source as never,
      target,
    });

    expect(result.outcome).toBe('too-large');
    expect(source.get).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('a chat-attachments key above the inline limit is too-large and never read', async () => {
    const source = {
      head: vi.fn(async () => ({
        contentLength: MAX_CHAT_ATTACHMENT_BYTES + 1,
        contentType: 'application/pdf',
        etag: 'x',
      })),
      get: vi.fn(),
    };
    const target = backupTarget();
    const targetHead = vi.spyOn(target.store, 'head');
    const targetPut = vi.spyOn(target.store, 'put');

    const result = await replicateObject(CHAT_KEY, { source: source as never, target });

    expect(result).toEqual({ outcome: 'too-large', bytes: MAX_CHAT_ATTACHMENT_BYTES + 1 });
    expect(source.head).toHaveBeenCalledTimes(1);
    expect(source.get).not.toHaveBeenCalled();
    expect(targetHead).not.toHaveBeenCalled();
    expect(targetPut).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('a chat-attachments key whose head carries no length is too-large and never read', async () => {
    const source = {
      head: vi.fn(async () => ({ contentType: 'application/pdf', etag: 'x' })),
      get: vi.fn(),
    };
    const target = backupTarget();
    const targetPut = vi.spyOn(target.store, 'put');

    const result = await replicateObject(CHAT_KEY, { source: source as never, target });

    expect(result).toEqual({ outcome: 'too-large', bytes: 0 });
    expect(source.get).not.toHaveBeenCalled();
    expect(targetPut).not.toHaveBeenCalled();
  });

  it('a chat-attachments key at the inline limit is copied', async () => {
    const source = {
      head: vi.fn(async () => ({
        contentLength: MAX_CHAT_ATTACHMENT_BYTES,
        contentType: 'application/pdf',
        etag: 'x',
      })),
      get: vi.fn(async () => ({ data: BYTES, contentType: 'application/pdf' })),
    };
    const target = backupTarget();

    const result = await replicateObject(CHAT_KEY, { source: source as never, target });

    expect(result).toEqual({ outcome: 'replicated', bytes: BYTES.byteLength });
    expect(source.get).toHaveBeenCalledTimes(1);
    await expect(target.store.head(BACKUP_BUCKET, CHAT_KEY)).resolves.not.toBeNull();
  });

  it('a 200 MiB generated-media key is still copied', async () => {
    const source = {
      head: vi.fn(async () => ({
        contentLength: 200 * MIB,
        contentType: 'video/mp4',
        etag: 'x',
      })),
      get: vi.fn(async () => ({ data: BYTES, contentType: 'video/mp4' })),
    };
    const target = backupTarget();

    const result = await replicateObject(MEDIA_VIDEO_KEY, { source: source as never, target });

    expect(result.outcome).toBe('replicated');
    expect(source.get).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no backup target is configured', async () => {
    await expect(replicateObject(KEY, { target: null })).resolves.toEqual({
      outcome: 'unconfigured',
      bytes: 0,
    });
  });
});
