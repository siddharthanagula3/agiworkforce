import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore } from '@agiworkforce/object-storage';
import { RESUMABLE_UPLOAD_PART_BYTES } from '@agiworkforce/cloud-contracts';

const { mockGetUserScopedDb, mockCompleteChatAttachmentUpload, store, scopedDb } = vi.hoisted(
  () => ({
    mockGetUserScopedDb: vi.fn(),
    mockCompleteChatAttachmentUpload: vi.fn(),
    store: {
      current: null as ReturnType<
        typeof import('@agiworkforce/object-storage').createMemoryObjectStore
      > | null,
    },
    scopedDb: { query: vi.fn() },
  }),
);

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
vi.mock('@/lib/server/product-analytics', () => ({
  DERIVED_MILESTONE_EVENTS: vi.fn(),
  DERIVED_PRODUCT_ANALYTICS_EVENTS: vi.fn(),
  isProductAnalyticsAllowed: vi.fn(),
  recordProductAnalyticsEvents: vi.fn(),
  trackAuditedProductEvent: vi.fn(),
  trackMeteredCapability: vi.fn(),
  resolveProductAnalyticsSurface: () => 'web',
  trackProductAnalyticsEvent: vi.fn(),
}));
vi.mock('@/lib/server/chat-attachment-completion', () => ({
  isOwnedChatAttachmentUploadKey: vi.fn(),
  purgeChatAttachmentUpload: vi.fn(),
  completeChatAttachmentUpload: mockCompleteChatAttachmentUpload,
  findCompletedChatAttachment: vi.fn().mockResolvedValue(null),
  resolveTemporaryChatUpload: vi.fn().mockResolvedValue(false),
  resolveUploadSourceSurface: () => 'web',
}));
vi.mock('@/lib/server/project-knowledge-files', () => ({
  findOwnedProjectKnowledgeFile: vi.fn(),
  isSchemaNotReady: vi.fn(),
  projectKnowledgeResponse: vi.fn(),
  readIndexStates: vi.fn(),
  checkProjectKnowledgeCapacity: vi.fn(),
  findProjectKnowledgeFileByChecksum: vi.fn().mockResolvedValue(null),
  registerProjectKnowledgeFile: vi.fn(),
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  assertUploadMatchesAuthorization: vi.fn(),
  createLocalProjectKnowledgeUploadUrl: vi.fn(),
  createProjectKnowledgeUploadAuthorization: vi.fn(),
  getProjectKnowledgeObject: vi.fn(),
  isProjectKnowledgeObjectStorageConfigured: vi.fn(),
  isSealedProjectKnowledgeKey: vi.fn(),
  sealedProjectKnowledgeKey: vi.fn(),
  storeLocalProjectKnowledgeUpload: vi.fn(),
  verifyProjectKnowledgeUploadAuthorization: vi.fn(),
  deleteProjectKnowledgeObject: vi.fn().mockResolvedValue(undefined),
  sealProjectKnowledgeObject: vi.fn(),
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
  GET as readProgress,
  POST as completeUpload,
  PUT as relayPart,
} from '../[uploadId]/route';

const USER_ID = 'user-owner';
const PRIVATE_BUCKET = 'agi-private';
const LEAD = new Uint8Array(RESUMABLE_UPLOAD_PART_BYTES).map((_value, index) => index % 253);
const TAIL = new Uint8Array(Array.from({ length: 24 }, (_value, index) => 240 - index));
const FILE_BYTES = Buffer.concat([Buffer.from(LEAD), Buffer.from(TAIL)]);

interface OpenedUpload {
  uploadId: string;
  session: string;
}

function createRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as never;
}

function context(uploadId: string) {
  return { params: Promise.resolve({ uploadId }) } as never;
}

async function openUpload(): Promise<OpenedUpload> {
  const response = await createUpload(
    createRequest('http://localhost:3000/api/files/uploads', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'chat-attachment',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        byteCount: FILE_BYTES.byteLength,
        checksumSha256: createHash('sha256').update(FILE_BYTES).digest('hex'),
      }),
    }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

function sessionUrl(upload: OpenedUpload): string {
  return `http://localhost:3000/api/files/uploads/${upload.uploadId}?session=${encodeURIComponent(upload.session)}`;
}

function sendPart(upload: OpenedUpload, partNumber: number, body: Uint8Array) {
  return relayPart(
    createRequest(`${sessionUrl(upload)}&partNumber=${partNumber}`, {
      method: 'PUT',
      body: body as BodyInit,
    }),
    context(upload.uploadId),
  );
}

function progress(upload: OpenedUpload) {
  return readProgress(createRequest(sessionUrl(upload)), context(upload.uploadId));
}

function finish(upload: OpenedUpload) {
  return completeUpload(
    createRequest(`http://localhost:3000/api/files/uploads/${upload.uploadId}`, {
      method: 'POST',
      body: JSON.stringify({ session: upload.session }),
    }),
    context(upload.uploadId),
  );
}

function cancel(upload: OpenedUpload) {
  return abortUpload(
    createRequest(sessionUrl(upload), { method: 'DELETE' }),
    context(upload.uploadId),
  );
}

async function pendingKey(): Promise<string> {
  const pending = (await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)) ?? [];
  expect(pending).toHaveLength(1);
  return pending[0]!.key;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.current = createMemoryObjectStore();
  mockGetUserScopedDb.mockResolvedValue({ db: scopedDb, userId: USER_ID, organizationId: null });
  mockCompleteChatAttachmentUpload.mockImplementation(async (input: { byteCount: number }) => ({
    id: '3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31',
    name: 'report.pdf',
    mimeType: 'application/pdf',
    byteCount: input.byteCount,
    type: 'file',
    url: '/api/files/3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31',
  }));
});

describe('a resumable upload that is interrupted', () => {
  it('reports stored bytes as each part arrives', async () => {
    const upload = await openUpload();

    const empty = await (await progress(upload)).json();
    expect(empty.bytesStored).toBe(0);
    expect(empty.parts).toEqual([]);

    await sendPart(upload, 1, LEAD);

    const afterFirst = await (await progress(upload)).json();
    expect(afterFirst.bytesStored).toBe(LEAD.byteLength);
    expect(afterFirst.parts.map((part: { partNumber: number }) => part.partNumber)).toEqual([1]);
  });

  it('resumes by sending only the part the host is missing', async () => {
    const upload = await openUpload();
    const key = await pendingKey();
    await sendPart(upload, 1, LEAD);

    const resumed = await (await progress(upload)).json();
    const stored = new Set(resumed.parts.map((part: { partNumber: number }) => part.partNumber));
    expect(stored.has(1)).toBe(true);
    expect(stored.has(2)).toBe(false);

    await sendPart(upload, 2, TAIL);
    const completed = await finish(upload);

    expect(completed.status).toBe(200);
    const object = await store.current?.get(PRIVATE_BUCKET, key);
    expect(object ? Buffer.compare(Buffer.from(object.data), FILE_BYTES) : null).toBe(0);
  });

  it('stores a part re-sent after a dropped connection once, not twice', async () => {
    const upload = await openUpload();
    const key = await pendingKey();

    await sendPart(upload, 1, LEAD);
    await sendPart(upload, 1, LEAD);
    await sendPart(upload, 2, TAIL);

    const state = await (await progress(upload)).json();
    expect(state.parts).toHaveLength(2);
    expect(state.bytesStored).toBe(FILE_BYTES.byteLength);

    expect((await finish(upload)).status).toBe(200);
    const object = await store.current?.get(PRIVATE_BUCKET, key);
    expect(object?.data.byteLength).toBe(FILE_BYTES.byteLength);
  });

  it('answers a retried completion with the file it already finished', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, LEAD);
    await sendPart(upload, 2, TAIL);

    expect((await finish(upload)).status).toBe(200);
    const retried = await finish(upload);

    expect(retried.status).toBe(200);
    expect((await retried.json()).kind).toBe('chat-attachment');
  });

  it('leaves no stored object and records nothing when the user cancels', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, LEAD);
    const key = await pendingKey();

    const aborted = await cancel(upload);

    expect(aborted.status).toBe(200);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
    expect(await store.current?.head(PRIVATE_BUCKET, key)).toBeNull();
    expect(mockCompleteChatAttachmentUpload).not.toHaveBeenCalled();
  });

  it('tells a client whose session is gone to start again, and records nothing', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, LEAD);
    const key = await pendingKey();
    await cancel(upload);

    const completed = await finish(upload);

    expect(completed.status).toBe(404);
    expect((await completed.json()).error.message).toBe(
      'This upload is no longer open. Start it again to finish the file.',
    );
    expect(mockCompleteChatAttachmentUpload).not.toHaveBeenCalled();
    expect(await store.current?.head(PRIVATE_BUCKET, key)).toBeNull();
  });

  it('says the same thing when a part or a progress poll arrives after the session is gone', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, LEAD);
    await cancel(upload);

    for (const response of [await sendPart(upload, 2, TAIL), await progress(upload)]) {
      expect(response.status).toBe(404);
      expect((await response.json()).error.message).toBe(
        'This upload is no longer open. Start it again to finish the file.',
      );
    }
  });

  it('answers a second cancel without failing, because the upload is already gone', async () => {
    const upload = await openUpload();
    await sendPart(upload, 1, LEAD);

    const first = await cancel(upload);
    const second = await cancel(upload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ aborted: true });
  });

  it('still reports a storage outage as an outage rather than a closed session', async () => {
    const upload = await openUpload();
    const outage = new Error('the storage host refused the connection');
    vi.spyOn(store.current!, 'listUploadedParts').mockRejectedValueOnce(outage);

    const response = await progress(upload);

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).not.toContain('storage host');
  });
});
