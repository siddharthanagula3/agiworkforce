import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore } from '@agiworkforce/object-storage';
import { RESUMABLE_UPLOAD_PART_BYTES as PART_BYTES } from '@agiworkforce/cloud-contracts';

const {
  mockGetUserScopedDb,
  mockCompleteChatAttachmentUpload,
  mockCheckProjectKnowledgeCapacity,
  mockRegisterProjectKnowledgeFile,
  store,
  scopedDb,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockCompleteChatAttachmentUpload: vi.fn(),
  mockCheckProjectKnowledgeCapacity: vi.fn(),
  mockRegisterProjectKnowledgeFile: vi.fn(),
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
vi.mock('@/lib/server/product-analytics', () => ({
  resolveProductAnalyticsSurface: () => 'web',
  trackProductAnalyticsEvent: vi.fn(),
}));
vi.mock('@/lib/server/chat-attachment-completion', () => ({
  completeChatAttachmentUpload: mockCompleteChatAttachmentUpload,
  findCompletedChatAttachment: vi.fn().mockResolvedValue(null),
  resolveTemporaryChatUpload: vi.fn().mockResolvedValue(false),
  resolveUploadSourceSurface: () => 'web',
}));
vi.mock('@/lib/server/project-knowledge-files', () => ({
  checkProjectKnowledgeCapacity: mockCheckProjectKnowledgeCapacity,
  findProjectKnowledgeFileByChecksum: vi.fn().mockResolvedValue(null),
  registerProjectKnowledgeFile: mockRegisterProjectKnowledgeFile,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: vi.fn().mockResolvedValue(undefined),
  sealProjectKnowledgeObject: vi.fn(),
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
  GET as readProgress,
  POST as completeUpload,
  PUT as relayPart,
} from '../[uploadId]/route';
import { POST as signParts } from '../[uploadId]/parts/route';

const USER_ID = 'user-owner';
const PRIVATE_BUCKET = 'agi-private';
const PART_ONE = new Uint8Array(PART_BYTES).map((_value, index) => index % 251);
const PART_TWO = new Uint8Array(Array.from({ length: 16 }, (_value, index) => 200 - index));
const FILE_BYTES = Buffer.concat([Buffer.from(PART_ONE), Buffer.from(PART_TWO)]);
const CHECKSUM = createHash('sha256').update(FILE_BYTES).digest('hex');

interface OpenedUpload {
  uploadId: string;
  session: string;
  partBytes: number;
  partCount: number;
  expiresAt: string;
}

function createRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as never;
}

function context(uploadId: string) {
  return { params: Promise.resolve({ uploadId }) } as never;
}

async function openUpload(overrides: Record<string, unknown> = {}): Promise<OpenedUpload> {
  const response = await createUpload(
    createRequest('http://localhost:3000/api/files/uploads', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'chat-attachment',
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        byteCount: FILE_BYTES.byteLength,
        checksumSha256: CHECKSUM,
        ...overrides,
      }),
    }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

function sessionUrl(upload: OpenedUpload, origin = 'http://localhost:3000'): string {
  return `${origin}/api/files/uploads/${upload.uploadId}?session=${encodeURIComponent(upload.session)}`;
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

function finish(upload: OpenedUpload) {
  return completeUpload(
    createRequest(`http://localhost:3000/api/files/uploads/${upload.uploadId}`, {
      method: 'POST',
      body: JSON.stringify({ session: upload.session }),
    }),
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
  store.current = createMemoryObjectStore({ uploadBaseUrl: 'https://objects.example.test/put' });
  mockGetUserScopedDb.mockResolvedValue({ db: scopedDb, userId: USER_ID, organizationId: null });
  mockCheckProjectKnowledgeCapacity.mockResolvedValue({ status: 'ready', planTier: 'pro' });
  mockCompleteChatAttachmentUpload.mockImplementation(
    async (input: { fileName: string; mimeType: string; byteCount: number }) => ({
      id: '3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31',
      name: input.fileName,
      mimeType: input.mimeType,
      byteCount: input.byteCount,
      type: 'file',
      url: '/api/files/3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31',
    }),
  );
});

describe('resumable upload for every upload kind', () => {
  it('opens an upload that names the part size and how many parts it takes', async () => {
    const opened = await openUpload();

    expect(opened.uploadId).toBeTruthy();
    expect(opened.session).toBeTruthy();
    expect(opened.partBytes).toBe(PART_BYTES);
    expect(opened.partCount).toBe(2);
    expect(Date.parse(opened.expiresAt)).toBeGreaterThan(Date.now());
    expect(await pendingKey()).toMatch(/^chat-attachments\/user-owner\/\d+_[A-Za-z0-9]+\.txt$/);
  });

  it('refuses a file type chat does not accept', async () => {
    const response = await createUpload(
      createRequest('http://localhost:3000/api/files/uploads', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'chat-attachment',
          fileName: 'tool.exe',
          mimeType: 'application/x-msdownload',
          byteCount: FILE_BYTES.byteLength,
          checksumSha256: CHECKSUM,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
  });

  it('refuses a project source the project has no room for before any byte moves', async () => {
    const { createError } = await import('@/lib/errors');
    mockCheckProjectKnowledgeCapacity.mockRejectedValue(
      createError.conflict('This file is already in the project as "notes.txt".'),
    );

    const response = await createUpload(
      createRequest('http://localhost:3000/api/files/uploads', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'knowledge-file',
          projectId: 'project-1',
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          byteCount: FILE_BYTES.byteLength,
          checksumSha256: CHECKSUM,
          sourceSurface: 'web',
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
  });

  it('signs each part straight to storage from an origin storage accepts', async () => {
    const opened = await openUpload();

    const response = await signParts(
      createRequest(`http://localhost:3000/api/files/uploads/${opened.uploadId}/parts`, {
        method: 'POST',
        body: JSON.stringify({ session: opened.session, partNumbers: [1, 2] }),
      }),
      context(opened.uploadId),
    );
    const body = (await response.json()) as {
      parts: { partNumber: number; url: string; method: string }[];
    };

    expect(response.status).toBe(200);
    expect(body.parts.map((part) => part.method)).toEqual(['PUT', 'PUT']);
    const lengths = body.parts.map((part) =>
      Number(new URL(part.url).searchParams.get('contentLength')),
    );
    expect(lengths).toEqual([PART_BYTES, 16]);
    for (const part of body.parts) {
      expect(new URL(part.url).origin).toBe('https://objects.example.test');
      expect(new URL(part.url).searchParams.get('uploadId')).toBe(opened.uploadId);
    }
  });

  it('relays parts through the app from an origin storage does not accept', async () => {
    const opened = await openUpload();

    const response = await signParts(
      createRequest(`http://localhost:4000/api/files/uploads/${opened.uploadId}/parts`, {
        method: 'POST',
        body: JSON.stringify({ session: opened.session, partNumbers: [2] }),
      }),
      context(opened.uploadId),
    );
    const body = (await response.json()) as { parts: { url: string }[] };

    const relayUrl = new URL(body.parts[0]!.url);
    expect(relayUrl.origin).toBe('http://localhost:4000');
    expect(relayUrl.pathname).toBe(`/api/files/uploads/${opened.uploadId}`);
    expect(relayUrl.searchParams.get('partNumber')).toBe('2');
    expect(relayUrl.searchParams.get('session')).toBe(opened.session);
  });

  it('reports the parts already stored so an interrupted upload resumes', async () => {
    const opened = await openUpload();
    await sendPart(opened, 1, PART_ONE);

    const listed = await (
      await readProgress(createRequest(sessionUrl(opened)), context(opened.uploadId))
    ).json();

    expect(listed.parts).toEqual([{ partNumber: 1, size: PART_BYTES }]);
    expect(listed.bytesStored).toBe(PART_BYTES);
  });

  it('assembles the parts and hands the object to the chat attachment pipeline', async () => {
    const opened = await openUpload();
    const key = await pendingKey();
    await sendPart(opened, 1, PART_ONE);
    await sendPart(opened, 2, PART_TWO);

    const completed = await finish(opened);

    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({
      kind: 'chat-attachment',
      attachment: { name: 'notes.txt', byteCount: FILE_BYTES.byteLength },
    });
    expect(mockCompleteChatAttachmentUpload).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: key, checksumSha256: CHECKSUM, userId: USER_ID }),
    );
    const stored = await store.current?.get(PRIVATE_BUCKET, key);
    expect(stored ? Buffer.compare(Buffer.from(stored.data), FILE_BYTES) : null).toBe(0);
  });

  it('registers an assembled project source with its project', async () => {
    const opened = await openUpload({
      kind: 'knowledge-file',
      projectId: 'project-1',
      sourceSurface: 'web',
    });
    const key = await pendingKey();
    mockRegisterProjectKnowledgeFile.mockResolvedValue({
      status: 'created',
      file: {
        id: 'file-1',
        projectId: 'project-1',
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        byteCount: FILE_BYTES.byteLength,
        checksumSha256: CHECKSUM,
        summary: null,
        sourceSurface: 'web',
        addedByUserId: USER_ID,
        addedAt: '2026-09-27T00:00:00.000Z',
        storageUri: '/api/projects/project-1/knowledge-files/file-1',
        indexing: null,
      },
    });
    await sendPart(opened, 1, PART_ONE);
    await sendPart(opened, 2, PART_TWO);

    const completed = await finish(opened);

    expect(completed.status).toBe(200);
    expect((await completed.json()).kind).toBe('knowledge-file');
    expect(mockRegisterProjectKnowledgeFile).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', userId: USER_ID }),
      expect.objectContaining({ storageUri: key, checksumSha256: CHECKSUM, sourceSurface: 'web' }),
    );
  });

  it('refuses to complete an upload that is missing a part', async () => {
    const opened = await openUpload();
    await sendPart(opened, 1, PART_ONE);

    const response = await finish(opened);

    expect(response.status).toBe(409);
    expect(mockCompleteChatAttachmentUpload).not.toHaveBeenCalled();
  });

  it('refuses a part number outside the range the session allows', async () => {
    const opened = await openUpload();

    expect((await sendPart(opened, 0, PART_ONE)).status).toBe(400);
    expect((await sendPart(opened, 3, PART_TWO)).status).toBe(400);
  });

  it('refuses a relayed part that is not the size the session expects', async () => {
    const opened = await openUpload();

    const response = await sendPart(opened, 1, PART_TWO);

    expect(response.status).toBe(400);
  });

  it('will not let another account drive an upload it did not open', async () => {
    const opened = await openUpload();
    mockGetUserScopedDb.mockResolvedValue({
      db: scopedDb,
      userId: 'user-intruder',
      organizationId: null,
    });

    const response = await sendPart(opened, 1, PART_ONE);

    expect(response.status).toBe(404);
    mockGetUserScopedDb.mockResolvedValue({ db: scopedDb, userId: USER_ID, organizationId: null });
    const listed = await (
      await readProgress(createRequest(sessionUrl(opened)), context(opened.uploadId))
    ).json();
    expect(listed.parts).toEqual([]);
  });

  it('will not finish an upload in a different workspace from the one it started in', async () => {
    const opened = await openUpload();
    await sendPart(opened, 1, PART_ONE);
    await sendPart(opened, 2, PART_TWO);
    mockGetUserScopedDb.mockResolvedValue({
      db: scopedDb,
      userId: USER_ID,
      organizationId: '9d7c1c1e-5a0b-4a61-9a2b-3f7e2d1c0b9a',
    });

    const response = await finish(opened);

    expect(response.status).toBe(409);
    expect(mockCompleteChatAttachmentUpload).not.toHaveBeenCalled();
  });

  it('drops the parts of an abandoned upload when the client aborts it', async () => {
    const opened = await openUpload();
    await sendPart(opened, 1, PART_ONE);

    const response = await abortUpload(
      createRequest(sessionUrl(opened), { method: 'DELETE' }),
      context(opened.uploadId),
    );

    expect(response.status).toBe(200);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
  });
});
