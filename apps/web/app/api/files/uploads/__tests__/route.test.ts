import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore, objectChecksum } from '@agiworkforce/object-storage';

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

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/media-assets', () => ({
  upsertVideoMediaAsset: mockUpsertVideoMediaAsset,
}));
vi.mock('@/lib/server/object-storage-runtime', () => ({
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
import { RESUMABLE_PART_SIZE_BYTES } from '../resumable-upload';

const USER_ID = 'user-owner';
const MIME_TYPE = 'video/mp4';
const PART_ONE = new Uint8Array(Array.from({ length: 32 }, (_value, index) => index));
const PART_TWO = new Uint8Array(Array.from({ length: 16 }, (_value, index) => 200 - index));

function createRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as never;
}

function context(uploadId: string) {
  return { params: Promise.resolve({ uploadId }) } as never;
}

async function openUpload(): Promise<{ assetId: string; uploadId: string }> {
  const response = await createUpload(
    createRequest('http://localhost:3000/api/files/uploads', {
      method: 'POST',
      body: JSON.stringify({ fileName: 'clip.mp4', mimeType: MIME_TYPE, byteCount: 48 }),
    }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

function partUrl(uploadId: string, assetId: string, partNumber: number): string {
  return `http://localhost:3000/api/files/uploads/${uploadId}?assetId=${assetId}&mimeType=${encodeURIComponent(MIME_TYPE)}&partNumber=${partNumber}`;
}

function sessionUrl(uploadId: string, assetId: string): string {
  return `http://localhost:3000/api/files/uploads/${uploadId}?assetId=${assetId}&mimeType=${encodeURIComponent(MIME_TYPE)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.current = createMemoryObjectStore();
  mockGetUserScopedDb.mockResolvedValue({
    db: scopedDb,
    userId: USER_ID,
    organizationId: null,
  });
  mockUpsertVideoMediaAsset.mockImplementation(async (params: { id: string }) => params.id);
});

describe('resumable large-file upload', () => {
  it('opens an upload that names the part size and the ceiling', async () => {
    const opened = await openUpload();

    expect(opened.uploadId).toBeTruthy();
    expect(opened.assetId).toMatch(/^[0-9a-f-]{36}$/);
    const body = (await (
      await createUpload(
        createRequest('http://localhost:3000/api/files/uploads', {
          method: 'POST',
          body: JSON.stringify({ fileName: 'clip.mp4', mimeType: MIME_TYPE, byteCount: 48 }),
        }),
      )
    ).json()) as { partSizeBytes: number };
    expect(body.partSizeBytes).toBe(RESUMABLE_PART_SIZE_BYTES);
  });

  it('refuses a content type that is not a resumable upload', async () => {
    const response = await createUpload(
      createRequest('http://localhost:3000/api/files/uploads', {
        method: 'POST',
        body: JSON.stringify({ fileName: 'a.txt', mimeType: 'text/plain', byteCount: 4 }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('reports the parts already stored so an interrupted upload resumes', async () => {
    const { assetId, uploadId } = await openUpload();

    await uploadPart(
      createRequest(partUrl(uploadId, assetId, 1), { method: 'PUT', body: PART_ONE }),
      context(uploadId),
    );

    const listed = await (
      await listParts(createRequest(sessionUrl(uploadId, assetId)), context(uploadId))
    ).json();

    expect(listed.parts).toHaveLength(1);
    expect(listed.parts[0].checksumSha256).toBe(objectChecksum(PART_ONE));
    expect(listed.bytesStored).toBe(PART_ONE.byteLength);
  });

  it('assembles the parts and records a media asset the file route can serve', async () => {
    const { assetId, uploadId } = await openUpload();

    await uploadPart(
      createRequest(partUrl(uploadId, assetId, 1), { method: 'PUT', body: PART_ONE }),
      context(uploadId),
    );
    await uploadPart(
      createRequest(partUrl(uploadId, assetId, 2), { method: 'PUT', body: PART_TWO }),
      context(uploadId),
    );

    const completed = await completeUpload(
      createRequest(`http://localhost:3000/api/files/uploads/${uploadId}`, {
        method: 'POST',
        body: JSON.stringify({ assetId, mimeType: MIME_TYPE, fileName: 'clip.mp4' }),
      }),
      context(uploadId),
    );
    const body = await completed.json();

    expect(completed.status).toBe(200);
    expect(body).toMatchObject({
      id: assetId,
      url: `/api/files/${assetId}`,
      byteSize: PART_ONE.byteLength + PART_TWO.byteLength,
      parts: 2,
    });

    const recorded = mockUpsertVideoMediaAsset.mock.calls[0]?.[0] as {
      storagePathname: string;
      userId: string;
    };
    expect(recorded.userId).toBe(USER_ID);
    expect(recorded.storagePathname).toMatch(
      /^private-media\/video\/[a-f0-9]{32}\/[0-9a-f-]{36}\.mp4$/,
    );

    const stored = await store.current?.get('agi-private', recorded.storagePathname);
    expect(stored ? Buffer.from(stored.data) : null).toEqual(
      Buffer.concat([Buffer.from(PART_ONE), Buffer.from(PART_TWO)]),
    );
  });

  it('refuses to complete an upload that has stored no part', async () => {
    const { assetId, uploadId } = await openUpload();

    const response = await completeUpload(
      createRequest(`http://localhost:3000/api/files/uploads/${uploadId}`, {
        method: 'POST',
        body: JSON.stringify({ assetId, mimeType: MIME_TYPE, fileName: 'clip.mp4' }),
      }),
      context(uploadId),
    );

    expect(response.status).toBe(400);
    expect(mockUpsertVideoMediaAsset).not.toHaveBeenCalled();
  });

  it('refuses a part number outside the range the session allows', async () => {
    const { assetId, uploadId } = await openUpload();

    const response = await uploadPart(
      createRequest(partUrl(uploadId, assetId, 0), { method: 'PUT', body: PART_ONE }),
      context(uploadId),
    );

    expect(response.status).toBe(400);
  });

  it('will not let another account drive an upload it did not open', async () => {
    const { assetId, uploadId } = await openUpload();
    await uploadPart(
      createRequest(partUrl(uploadId, assetId, 1), { method: 'PUT', body: PART_ONE }),
      context(uploadId),
    );

    mockGetUserScopedDb.mockResolvedValue({
      db: scopedDb,
      userId: 'user-intruder',
      organizationId: null,
    });

    const response = await uploadPart(
      createRequest(partUrl(uploadId, assetId, 2), { method: 'PUT', body: PART_TWO }),
      context(uploadId),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    const listed = await (
      await listParts(createRequest(sessionUrl(uploadId, assetId)), context(uploadId))
    ).json();
    expect(listed.parts ?? []).toHaveLength(0);
  });

  it('drops the parts of an abandoned upload when the client aborts it', async () => {
    const { assetId, uploadId } = await openUpload();
    await uploadPart(
      createRequest(partUrl(uploadId, assetId, 1), { method: 'PUT', body: PART_ONE }),
      context(uploadId),
    );

    const response = await abortUpload(
      createRequest(sessionUrl(uploadId, assetId), { method: 'DELETE' }),
      context(uploadId),
    );

    expect(response.status).toBe(200);
    expect(await store.current?.listPendingMultipartUploads('agi-private')).toEqual([]);
  });
});
