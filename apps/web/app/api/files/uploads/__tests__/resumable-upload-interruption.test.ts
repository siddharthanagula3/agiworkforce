import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore } from '@agiworkforce/object-storage';

const { mockGetUserScopedDb, mockUpsertVideoMediaAsset, store, scopedDb } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockUpsertVideoMediaAsset: vi.fn(),
  store: {
    current: null as ReturnType<
      typeof import('@agiworkforce/object-storage').createMemoryObjectStore
    > | null,
  },
  scopedDb: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getUserScopedDb: mockGetUserScopedDb,
}));
vi.mock('@/lib/server/media-assets', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  upsertVideoMediaAsset: mockUpsertVideoMediaAsset,
}));
vi.mock('@/lib/server/object-storage-runtime', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getObjectStore: () => store.current,
  objectStorageConfig: () => ({
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
  }),
}));

import { POST as createUpload } from '../route';
import {
  DELETE as abortUpload,
  GET as listParts,
  POST as completeUpload,
  PUT as uploadPart,
} from '../[uploadId]/route';
import { MAX_RESUMABLE_UPLOAD_BYTES } from '../resumable-upload';

const USER_ID = 'user-owner';
const MIME_TYPE = 'video/mp4';
const PRIVATE_BUCKET = 'agi-private';
const MP4_LEAD = new Uint8Array([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
]);
const EXECUTABLE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const TAIL = new Uint8Array(Array.from({ length: 24 }, (_value, index) => 240 - index));

function createRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as never;
}

function context(uploadId: string) {
  return { params: Promise.resolve({ uploadId }) } as never;
}

interface OpenedUpload {
  assetId: string;
  uploadId: string;
  maxBytes: number;
}

async function openUpload(): Promise<OpenedUpload> {
  const response = await createUpload(
    createRequest('http://localhost:3000/api/files/uploads', {
      method: 'POST',
      body: JSON.stringify({ fileName: 'clip.mp4', mimeType: MIME_TYPE, byteCount: 40 }),
    }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

function partUrl(upload: OpenedUpload, partNumber: number): string {
  return `http://localhost:3000/api/files/uploads/${upload.uploadId}?assetId=${upload.assetId}&mimeType=${encodeURIComponent(MIME_TYPE)}&partNumber=${partNumber}`;
}

function sessionUrl(upload: OpenedUpload): string {
  return `http://localhost:3000/api/files/uploads/${upload.uploadId}?assetId=${upload.assetId}&mimeType=${encodeURIComponent(MIME_TYPE)}`;
}

function sendPart(upload: OpenedUpload, partNumber: number, body: Uint8Array) {
  return uploadPart(
    createRequest(partUrl(upload, partNumber), { method: 'PUT', body: body as BodyInit }),
    context(upload.uploadId),
  );
}

function readProgress(upload: OpenedUpload) {
  return listParts(createRequest(sessionUrl(upload)), context(upload.uploadId));
}

function finish(upload: OpenedUpload) {
  return completeUpload(
    createRequest(`http://localhost:3000/api/files/uploads/${upload.uploadId}`, {
      method: 'POST',
      body: JSON.stringify({
        assetId: upload.assetId,
        mimeType: MIME_TYPE,
        fileName: 'clip.mp4',
      }),
    }),
    context(upload.uploadId),
  );
}

async function pendingKey(): Promise<string> {
  const pending = (await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)) ?? [];
  expect(pending).toHaveLength(1);
  return pending[0]!.key;
}

function storedPathname(): string {
  const recorded = mockUpsertVideoMediaAsset.mock.calls[0]?.[0] as
    { storagePathname: string } | undefined;
  return recorded?.storagePathname ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
  store.current = createMemoryObjectStore();
  mockGetUserScopedDb.mockResolvedValue({ db: scopedDb, userId: USER_ID, organizationId: null });
  mockUpsertVideoMediaAsset.mockImplementation(async (params: { id: string }) => params.id);
});

describe('a resumable upload that is interrupted', () => {
  it('reports stored bytes against the ceiling the session declared', async () => {
    const upload = await openUpload();
    expect(upload.maxBytes).toBe(MAX_RESUMABLE_UPLOAD_BYTES);

    const empty = await (await readProgress(upload)).json();
    expect(empty.bytesStored).toBe(0);
    expect(empty.parts).toEqual([]);

    await sendPart(upload, 1, MP4_LEAD);

    const afterFirst = await (await readProgress(upload)).json();
    expect(afterFirst.bytesStored).toBe(MP4_LEAD.byteLength);
    expect(afterFirst.parts.map((part: { partNumber: number }) => part.partNumber)).toEqual([1]);
  });

  it('resumes by sending only the part the host is missing', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, MP4_LEAD);

    const resumed = await (await readProgress(upload)).json();
    const stored = new Set(resumed.parts.map((part: { partNumber: number }) => part.partNumber));
    expect(stored.has(1)).toBe(true);
    expect(stored.has(2)).toBe(false);

    await sendPart(upload, 2, TAIL);
    const completed = await finish(upload);

    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({
      id: upload.assetId,
      byteSize: MP4_LEAD.byteLength + TAIL.byteLength,
      parts: 2,
    });

    const object = await store.current?.get(PRIVATE_BUCKET, storedPathname());
    expect(object ? Buffer.from(object.data) : null).toEqual(
      Buffer.concat([Buffer.from(MP4_LEAD), Buffer.from(TAIL)]),
    );
  });

  it('stores a part re-sent after a dropped connection once, not twice', async () => {
    const upload = await openUpload();

    await sendPart(upload, 1, MP4_LEAD);
    await sendPart(upload, 1, MP4_LEAD);
    await sendPart(upload, 2, TAIL);

    const progress = await (await readProgress(upload)).json();
    expect(progress.parts).toHaveLength(2);
    expect(progress.bytesStored).toBe(MP4_LEAD.byteLength + TAIL.byteLength);

    const body = await (await finish(upload)).json();
    expect(body.byteSize).toBe(MP4_LEAD.byteLength + TAIL.byteLength);

    const object = await store.current?.get(PRIVATE_BUCKET, storedPathname());
    expect(object?.data.byteLength).toBe(MP4_LEAD.byteLength + TAIL.byteLength);
  });

  it('keeps the session open after a refused part so a good one can replace it', async () => {
    const upload = await openUpload();

    const refused = await sendPart(upload, 1, EXECUTABLE);
    expect(refused.status).toBe(400);
    expect((await refused.json()).error.message).not.toMatch(/undefined|\[object|Error:/);

    const afterRefusal = await (await readProgress(upload)).json();
    expect(afterRefusal.parts).toEqual([]);

    await sendPart(upload, 1, MP4_LEAD);
    const completed = await finish(upload);

    expect(completed.status).toBe(200);
    expect(mockUpsertVideoMediaAsset).toHaveBeenCalledTimes(1);
  });

  it('leaves no stored object and records no asset when the user cancels', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, MP4_LEAD);
    const key = await pendingKey();

    const aborted = await abortUpload(
      createRequest(sessionUrl(upload), { method: 'DELETE' }),
      context(upload.uploadId),
    );

    expect(aborted.status).toBe(200);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
    expect(await store.current?.head(PRIVATE_BUCKET, key)).toBeNull();
    expect(mockUpsertVideoMediaAsset).not.toHaveBeenCalled();
  });

  it('tells a client whose session is gone to start again, and records nothing', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, MP4_LEAD);
    const key = await pendingKey();
    await abortUpload(
      createRequest(sessionUrl(upload), { method: 'DELETE' }),
      context(upload.uploadId),
    );

    const completed = await finish(upload);

    expect(completed.status).toBe(404);
    expect((await completed.json()).error.message).toBe(
      'This upload is no longer open. Start it again to finish the file.',
    );
    expect(mockUpsertVideoMediaAsset).not.toHaveBeenCalled();
    expect(await store.current?.head(PRIVATE_BUCKET, key)).toBeNull();
  });

  it('says the same thing when a part or a progress poll arrives after the session is gone', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, MP4_LEAD);
    await abortUpload(
      createRequest(sessionUrl(upload), { method: 'DELETE' }),
      context(upload.uploadId),
    );

    for (const response of [await sendPart(upload, 2, TAIL), await readProgress(upload)]) {
      expect(response.status).toBe(404);
      expect((await response.json()).error.message).toBe(
        'This upload is no longer open. Start it again to finish the file.',
      );
    }
  });

  it('answers a second cancel without failing, because the upload is already gone', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, MP4_LEAD);

    const first = await abortUpload(
      createRequest(sessionUrl(upload), { method: 'DELETE' }),
      context(upload.uploadId),
    );
    const second = await abortUpload(
      createRequest(sessionUrl(upload), { method: 'DELETE' }),
      context(upload.uploadId),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ aborted: true });
  });

  it('still reports a storage outage as an outage rather than a closed session', async () => {
    const upload = await openUpload();
    const outage = new Error('the storage host refused the connection');
    vi.spyOn(store.current!, 'listUploadedParts').mockRejectedValueOnce(outage);

    const response = await readProgress(upload);

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).not.toContain('storage host');
  });
});
