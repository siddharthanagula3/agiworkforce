type OriginalProjectKnowledgeFilesModule = typeof import('@/lib/server/project-knowledge-files');
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import { createMemoryObjectStore } from '@agiworkforce/object-storage';
import {
  CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  chatLargeFilePartBytes,
  RESUMABLE_UPLOAD_PART_BYTES as PART_BYTES,
  RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES,
} from '@agiworkforce/cloud-contracts';

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
  scopedDb: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
}));

type UploadSigningModule = typeof import('@/lib/server/upload-signing');

const large = vi.hoisted(() => ({
  planTier: 'basic',
  keyValue: null as unknown,
  failInsert: false,
  failSigning: false,
  insertIntake: vi.fn(),
  touchPartRequest: vi.fn(),
  markUploaded: vi.fn(),
  readIntakeStatus: vi.fn(),
  countInFlightIntakes: vi.fn(),
  sumInFlightIntakeBytes: vi.fn(),
  cancelIntakeByStagingKey: vi.fn(),
  startWorkflow: vi.fn(async (_input: unknown) => 'run-1'),
}));

vi.mock('@/lib/server/chat-file-intake/store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  insertIntake: (...args: unknown[]) => large.insertIntake(...args),
  touchPartRequest: (...args: unknown[]) => large.touchPartRequest(...args),
  markUploaded: (...args: unknown[]) => large.markUploaded(...args),
  readIntakeStatus: (...args: unknown[]) => large.readIntakeStatus(...args),
  countInFlightIntakes: (...args: unknown[]) => large.countInFlightIntakes(...args),
  sumInFlightIntakeBytes: (...args: unknown[]) => large.sumInFlightIntakeBytes(...args),
  cancelIntakeByStagingKey: (...args: unknown[]) => large.cancelIntakeByStagingKey(...args),
}));
vi.mock('@/lib/server/upload-signing', async (importOriginal) => {
  const actual = await importOriginal<UploadSigningModule>();
  return {
    ...actual,
    signUploadClaims: (purpose: string, claims: object) =>
      large.failSigning
        ? Promise.reject(new Error('signing key unavailable'))
        : actual.signUploadClaims(purpose, claims),
  };
});
vi.mock('@/lib/workflows/start-chat-file-intake-workflow', () => ({
  startChatFileIntakeWorkflow: (input: unknown) => large.startWorkflow(input),
  dispatchChatFileIntakeWorkflows: vi.fn(),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEntitledPlanTier: async () => large.planTier,
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getKeyValueStore: () => large.keyValue,
}));

const mockAdmitAttachmentUpload = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined));
vi.mock('@/lib/server/attachment-allowance', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  admitAttachmentUpload: (input: unknown) => mockAdmitAttachmentUpload(input),
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
  resolveTemporaryChatUpload: vi.fn(async () => ({ temporary: false, conversationId: null })),
  resolveUploadSourceSurface: () => 'web',
}));
vi.mock('@/lib/server/project-knowledge-files', async (importOriginal) => ({
  ...(await importOriginal<OriginalProjectKnowledgeFilesModule>()),
  checkProjectKnowledgeCapacity: mockCheckProjectKnowledgeCapacity,
  findProjectKnowledgeFileByChecksum: vi.fn().mockResolvedValue(null),
  registerProjectKnowledgeFile: mockRegisterProjectKnowledgeFile,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
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

  it('admits every new upload against the plan before storage opens it', async () => {
    await openUpload();

    expect(mockAdmitAttachmentUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-owner',
        kind: 'chat-attachment',
        byteCount: FILE_BYTES.byteLength,
        mimeType: 'text/plain',
      }),
    );
  });

  it('answers a plan refusal with its message and opens nothing', async () => {
    const { attachmentSizeRefusal } = await import('@/lib/server/attachment-allowance');
    mockAdmitAttachmentUpload.mockRejectedValueOnce(
      attachmentSizeRefusal(
        'pro',
        'chat-attachment',
        MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1,
        'image/png',
      ),
    );

    const response = await createUpload(
      createRequest('http://localhost:3000/api/files/uploads', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'chat-attachment',
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          byteCount: FILE_BYTES.byteLength,
          checksumSha256: CHECKSUM,
        }),
      }),
    );

    expect(response.status).toBe(413);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toBe(CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toHaveLength(0);
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
    const body = (await response.json()) as { parts: { url: string; segmentBytes?: number }[] };

    expect(body.parts[0]!.segmentBytes).toBe(RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES);
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

type IntakeRow = import('@/lib/server/chat-file-intake/store').ChatFileIntakeRow;

const LARGE_BYTES = MAX_CHAT_ATTACHMENT_BYTES + 16;
const LARGE_CHECKSUM = 'b'.repeat(64);
const MIB = 1024 * 1024;
const SCANNER_URL = 'https://scanner.test/scan';
const RELAY_ORIGIN = 'http://localhost:4000';
const INTAKE_MARKER = 'select 1 from public.chat_file_intakes -- memory intake table';
const DAILY_KEY_PREFIX = 'agi:chat-files:daily-bytes:';
const NON_TERMINAL = new Set(['awaiting_parts', 'uploaded', 'inspecting', 'scanning', 'sealing']);

describe('large chat files', () => {
  const realFetch = globalThis.fetch;
  let systemTimeMs = Date.now();
  let scannerProtocol = 2;
  let intakes: Map<string, IntakeRow>;
  let keyValue: ReturnType<typeof createMemoryKeyValueStore>;
  const scannerFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes('/v2/capability')) return realFetch(input, init);
    return new Response(
      JSON.stringify({
        protocol: scannerProtocol,
        maxSourceScanBytes: 600 * MIB,
        queueDepth: 0,
        running: 0,
      }),
      { status: 200 },
    );
  });

  async function intakeStatement(db: { query: (sql: string) => Promise<unknown> }) {
    await db.query(INTAKE_MARKER);
  }

  function rowsOf(userId: string): IntakeRow[] {
    return [...intakes.values()].filter((row) => row.userId === userId);
  }

  function seedInFlight(count: number, byteCount: number) {
    for (let index = 0; index < count; index += 1) {
      const id = `00000000-0000-4000-8000-00000000000${index}`;
      intakes.set(id, {
        ...(intakes.get(id) ?? ({} as IntakeRow)),
        id,
        userId: USER_ID,
        organizationId: null,
        conversationId: null,
        temporaryChat: false,
        fileName: `seed-${index}.csv`,
        mimeType: 'text/csv',
        byteCount,
        declaredSha256: LARGE_CHECKSUM,
        stagingKey: `chat-attachments/${USER_ID}/seed-${index}.csv`,
        multipartUploadId: `seed-upload-${index}`,
        partBytes: chatLargeFilePartBytes(byteCount),
        state: 'awaiting_parts',
        refusalCode: null,
        failureCode: null,
        cancelReason: null,
        attempts: 0,
        firstSubmittedAt: null,
        scanBudgetWaitMs: 0,
        sealingEnteredAt: null,
        scanJobId: null,
        workflowRunId: null,
        etag: null,
        mediaAssetId: null,
        dailyBytesCharged: byteCount,
        bytesRefundedAt: null,
        leaseUntil: null,
        lastPartRequestAt: systemTimeMs,
        stateChangedAt: systemTimeMs,
        objectsPurgedAt: null,
        createdAt: systemTimeMs,
      });
    }
  }

  function installIntakeTable() {
    intakes = new Map();
    large.insertIntake.mockImplementation(async (db, input) => {
      await intakeStatement(db);
      if (large.failInsert) throw new Error('insert failed');
      const id = crypto.randomUUID();
      const row = {
        id,
        userId: input.userId,
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        temporaryChat: input.temporaryChat,
        fileName: input.fileName,
        mimeType: input.mimeType,
        byteCount: input.byteCount,
        declaredSha256: input.declaredSha256.toLowerCase(),
        stagingKey: input.stagingKey,
        multipartUploadId: input.multipartUploadId,
        partBytes: input.partBytes,
        state: 'awaiting_parts',
        refusalCode: null,
        failureCode: null,
        cancelReason: null,
        attempts: 0,
        firstSubmittedAt: null,
        scanBudgetWaitMs: 0,
        sealingEnteredAt: null,
        scanJobId: null,
        workflowRunId: null,
        etag: null,
        mediaAssetId: null,
        dailyBytesCharged: input.dailyBytesCharged,
        bytesRefundedAt: null,
        leaseUntil: null,
        lastPartRequestAt: input.nowMs,
        stateChangedAt: input.nowMs,
        objectsPurgedAt: null,
        createdAt: input.nowMs,
      } satisfies IntakeRow;
      intakes.set(id, row);
      return { ...row };
    });
    const awaiting = (userId: string, stagingKey: string) =>
      rowsOf(userId).find((row) => row.stagingKey === stagingKey && row.state === 'awaiting_parts');
    large.touchPartRequest.mockImplementation(async (db, input) => {
      await intakeStatement(db);
      const row = awaiting(input.userId, input.stagingKey);
      if (!row) return false;
      intakes.set(row.id, { ...row, lastPartRequestAt: input.nowMs });
      return true;
    });
    large.markUploaded.mockImplementation(async (db, input) => {
      await intakeStatement(db);
      const row = awaiting(input.userId, input.stagingKey);
      if (!row) return null;
      const next = { ...row, state: 'uploaded' as const, stateChangedAt: input.nowMs };
      intakes.set(row.id, next);
      return { ...next };
    });
    large.readIntakeStatus.mockImplementation(async (db, input) => {
      await intakeStatement(db);
      const row = intakes.get(input.intakeId);
      return row && row.userId === input.userId ? { ...row } : null;
    });
    large.countInFlightIntakes.mockImplementation(async (db, input) => {
      await intakeStatement(db);
      return rowsOf(input.userId).filter((row) => NON_TERMINAL.has(row.state)).length;
    });
    large.sumInFlightIntakeBytes.mockImplementation(async (db, input) => {
      await intakeStatement(db);
      return rowsOf(input.userId)
        .filter(
          (row) =>
            NON_TERMINAL.has(row.state) &&
            !row.temporaryChat &&
            row.organizationId === input.organizationId,
        )
        .reduce((sum, row) => sum + row.byteCount, 0);
    });
    large.cancelIntakeByStagingKey.mockImplementation(async (db, input) => {
      await intakeStatement(db);
      const row = awaiting(input.userId, input.stagingKey);
      if (!row) return null;
      const next = {
        ...row,
        state: 'cancelled' as const,
        cancelReason: 'client' as const,
        stateChangedAt: input.nowMs,
      };
      intakes.set(row.id, next);
      const { refundDailyLargeFileBytes } = await import('@/lib/server/chat-file-intake/quotas');
      await refundDailyLargeFileBytes({
        userId: row.userId,
        bytes: row.byteCount - Math.max(0, input.storedBytes),
        chargedAtMs: row.createdAt,
      });
      return { ...next };
    });
  }

  function installSerialTransactions() {
    let queue: Promise<unknown> = Promise.resolve();
    scopedDb.transaction.mockImplementation(
      async (work: (tx: { query: unknown; execute: unknown }) => Promise<unknown>) => {
        const turn = queue.then(async () => {
          const before = new Set(intakes.keys());
          try {
            return await work({ query: scopedDb.query, execute: scopedDb.execute });
          } catch (error) {
            for (const id of [...intakes.keys()]) if (!before.has(id)) intakes.delete(id);
            throw error;
          }
        });
        queue = turn.catch(() => undefined);
        return turn;
      },
    );
  }

  function readyDatabase(sql: string): unknown[] {
    if (/to_regclass/.test(sql)) {
      return [{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }];
    }
    if (/sum\(m\.byte_size\)/.test(sql)) return [{ total: '0' }];
    return [];
  }

  async function dailyBytes(): Promise<number> {
    const day = new Date(systemTimeMs).toISOString().slice(0, 10);
    return (await keyValue.get<number>(`${DAILY_KEY_PREFIX}${USER_ID}:${day}`)) ?? 0;
  }

  function createLarge(
    over: Record<string, unknown> = {},
    origin?: string,
    url = 'http://localhost:3000/api/files/uploads',
  ) {
    return createUpload(
      createRequest(url, {
        method: 'POST',
        headers: origin ? { origin } : {},
        body: JSON.stringify({
          kind: 'chat-large-file',
          fileName: 'survey.csv',
          mimeType: 'text/csv',
          byteCount: LARGE_BYTES,
          checksumSha256: LARGE_CHECKSUM,
          ...over,
        }),
      }),
    );
  }

  async function openLarge(over: Record<string, unknown> = {}): Promise<OpenedUpload> {
    const response = await createLarge(over);
    expect(response.status).toBe(200);
    return response.json();
  }

  async function errorOf(response: Response) {
    return (
      (await response.json()) as {
        error?: { code?: string; message?: string; details?: { code?: string } };
      }
    ).error;
  }

  async function storeAllParts(opened: OpenedUpload, key: string) {
    for (let partNumber = 1; partNumber <= opened.partCount; partNumber += 1) {
      const size =
        partNumber < opened.partCount
          ? opened.partBytes
          : LARGE_BYTES - opened.partBytes * (opened.partCount - 1);
      await store.current!.uploadPart({
        bucket: PRIVATE_BUCKET,
        key,
        uploadId: opened.uploadId,
        partNumber,
        body: new Uint8Array(size),
      });
    }
  }

  function signLargeParts(opened: OpenedUpload, origin?: string, nativeHost?: string) {
    const host = origin ?? nativeHost ?? 'http://localhost:3000';
    return signParts(
      createRequest(`${host}/api/files/uploads/${opened.uploadId}/parts`, {
        method: 'POST',
        headers: origin ? { origin } : {},
        body: JSON.stringify({ session: opened.session, partNumbers: [1] }),
      }),
      context(opened.uploadId),
    );
  }

  function abortLarge(opened: OpenedUpload) {
    return abortUpload(
      createRequest(sessionUrl(opened), { method: 'DELETE' }),
      context(opened.uploadId),
    );
  }

  beforeEach(async () => {
    const completion = await import('@/lib/server/chat-attachment-completion');
    vi.mocked(completion.resolveTemporaryChatUpload).mockResolvedValue({
      temporary: false,
      conversationId: null,
    });
    systemTimeMs += 60 * 60_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(systemTimeMs);
    vi.stubGlobal('fetch', scannerFetch);
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', 'on');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', '');
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', SCANNER_URL);
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_TOKEN', 'scanner-test-token');
    scannerProtocol = 2;
    large.planTier = 'basic';
    large.failInsert = false;
    large.failSigning = false;
    keyValue = createMemoryKeyValueStore();
    large.keyValue = keyValue;
    installIntakeTable();
    installSerialTransactions();
    scopedDb.query.mockImplementation(async (sql: string) => readyDatabase(sql));
  });

  afterEach(() => {
    scopedDb.query.mockReset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('admits a large create without the capability header and records its intake', async () => {
    const opened = await openLarge();
    const key = await pendingKey();

    expect(opened.partBytes).toBe(chatLargeFilePartBytes(LARGE_BYTES));
    expect(opened.partCount).toBe(Math.ceil(LARGE_BYTES / opened.partBytes));
    expect(key).toMatch(/^chat-attachments\/user-owner\/\d+_[A-Za-z0-9]+\.csv$/);
    expect(rowsOf(USER_ID)).toEqual([
      expect.objectContaining({
        state: 'awaiting_parts',
        stagingKey: key,
        byteCount: LARGE_BYTES,
        dailyBytesCharged: LARGE_BYTES,
        temporaryChat: false,
      }),
    ]);
    expect(await dailyBytes()).toBe(LARGE_BYTES);
    expect(mockAdmitAttachmentUpload).not.toHaveBeenCalled();
  });

  it('refuses a large create while the flag is off, opening and charging nothing', async () => {
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', '');

    const response = await createLarge();

    expect(response.status).toBe(413);
    expect((await errorOf(response))?.message).toBe('Files this large aren’t available yet.');
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
    expect(large.insertIntake).not.toHaveBeenCalled();
    expect(scannerFetch).not.toHaveBeenCalled();
    expect(await dailyBytes()).toBe(0);
  });

  it('refuses a large create while the scanner speaks protocol 1', async () => {
    scannerProtocol = 1;

    const response = await createLarge();

    expect(response.status).toBe(413);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
  });

  it('never admits a large file from a page whose parts would go through the relay', async () => {
    const response = await createLarge({}, RELAY_ORIGIN, `${RELAY_ORIGIN}/api/files/uploads`);

    expect(response.status).toBe(413);
    expect(large.insertIntake).not.toHaveBeenCalled();
  });

  it('admits a large file from a page the storage CORS rule lists', async () => {
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', RELAY_ORIGIN);

    const response = await createLarge({}, RELAY_ORIGIN, `${RELAY_ORIGIN}/api/files/uploads`);

    expect(response.status).toBe(200);
  });

  it('refuses a create whose bytes and two 500 MiB files in flight pass the storage quota', async () => {
    seedInFlight(2, 500 * MIB);

    const response = await createLarge({ byteCount: 100 * MIB });

    expect(response.status).toBe(413);
    const { UPLOAD_STORAGE_FULL_MESSAGE } = await import('@/lib/security/upload-scan');
    expect((await errorOf(response))?.message).toBe(UPLOAD_STORAGE_FULL_MESSAGE);
    expect(await dailyBytes()).toBe(0);
  });

  it('refuses the day’s large bytes beyond the plan with 429', async () => {
    const day = new Date(systemTimeMs).toISOString().slice(0, 10);
    await keyValue.increment(`${DAILY_KEY_PREFIX}${USER_ID}:${day}`, 2 * 1024 * MIB - MIB);

    const response = await createLarge();

    expect(response.status).toBe(429);
    expect((await errorOf(response))?.details?.code).toBe('daily_large_file_bytes_reached');
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
  });

  it('frees the slot when a large session is aborted, so a fourth create is admitted on Basic', async () => {
    const first = await openLarge();
    await openLarge();
    await openLarge();
    const fourth = await createLarge();
    expect(fourth.status).toBe(429);
    expect((await errorOf(fourth))?.details?.code).toBe('large_file_intakes_in_flight');
    expect(await dailyBytes()).toBe(3 * LARGE_BYTES);

    const firstKey = [...intakes.values()][0]!.stagingKey;
    await store.current!.uploadPart({
      bucket: PRIVATE_BUCKET,
      key: firstKey,
      uploadId: first.uploadId,
      partNumber: 1,
      body: new Uint8Array(first.partBytes),
    });
    const aborted = await abortLarge(first);

    expect(aborted.status).toBe(200);
    expect([...intakes.values()][0]).toMatchObject({ state: 'cancelled', cancelReason: 'client' });
    expect(await dailyBytes()).toBe(3 * LARGE_BYTES - (LARGE_BYTES - first.partBytes));
    const pending = (await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)) ?? [];
    expect(pending.map((upload) => upload.uploadId)).not.toContain(first.uploadId);
    expect((await createLarge()).status).toBe(200);
  });

  it('aborts the multipart upload and refunds the day when the intake row cannot be written', async () => {
    large.failInsert = true;

    const response = await createLarge();

    expect(response.status).toBe(500);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
    expect(await dailyBytes()).toBe(0);
  });

  it('cancels the intake, aborts the upload and refunds the day when the session cannot be signed', async () => {
    large.failSigning = true;

    const response = await createLarge();

    expect(response.status).toBe(500);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
    expect(rowsOf(USER_ID)).toEqual([
      expect.objectContaining({ state: 'cancelled', cancelReason: 'client' }),
    ]);
    expect(await dailyBytes()).toBe(0);
    expect((await createLarge()).status).toBe(500);
    expect(rowsOf(USER_ID).filter((row) => NON_TERMINAL.has(row.state))).toEqual([]);
  });

  it('never lets two creates that overlap on the last free slot both hold one', async () => {
    seedInFlight(2, MIB);
    const counted = large.countInFlightIntakes.getMockImplementation()!;
    let arrived = 0;
    let release: () => void = () => undefined;
    const bothCounted = new Promise<void>((resolve) => {
      release = resolve;
    });
    large.countInFlightIntakes.mockImplementation(async (db, input) => {
      const inFlight = await counted(db, input);
      arrived += 1;
      if (arrived === 2) release();
      if (arrived <= 2) await bothCounted;
      return inFlight;
    });

    const responses = await Promise.all([createLarge(), createLarge()]);
    const admitted = responses.filter((response) => response.status === 200).length;

    expect(responses.map((response) => response.status)).toContain(429);
    expect(rowsOf(USER_ID).filter((row) => NON_TERMINAL.has(row.state))).toHaveLength(2 + admitted);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toHaveLength(admitted);
    expect(await dailyBytes()).toBe(admitted * LARGE_BYTES);
  });

  it('admits exactly three of four creates that pass admission together on a plan whose cap is three', async () => {
    const counted = large.countInFlightIntakes.getMockImplementation()!;
    let arrived = 0;
    let release: () => void = () => undefined;
    const allCounted = new Promise<void>((resolve) => {
      release = resolve;
    });
    large.countInFlightIntakes.mockImplementation(async (db, input) => {
      const inFlight = await counted(db, input);
      arrived += 1;
      if (arrived === 4) release();
      if (arrived <= 4) await allCounted;
      return inFlight;
    });

    const responses = await Promise.all([
      createLarge(),
      createLarge(),
      createLarge(),
      createLarge(),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(3);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
    expect(rowsOf(USER_ID).filter((row) => NON_TERMINAL.has(row.state))).toHaveLength(3);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toHaveLength(3);
    expect(await dailyBytes()).toBe(3 * LARGE_BYTES);
  });

  it('keeps three of four creates when the one charged first writes its row last', async () => {
    const realCreate = store.current!.createMultipartUpload.bind(store.current!);
    let reached = 0;
    let releaseFirst: () => void = () => undefined;
    const firstMayWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    vi.spyOn(store.current!, 'createMultipartUpload').mockImplementation(async (input) => {
      const turn = reached;
      reached += 1;
      const handle = await realCreate(input);
      if (turn === 0) await firstMayWrite;
      return handle;
    });

    const responses: Promise<Response>[] = [];
    for (let index = 0; index < 4; index += 1) {
      vi.setSystemTime(systemTimeMs + index * 1000);
      responses.push(createLarge());
      await vi.waitFor(() => expect(reached).toBe(index + 1));
    }
    const later = await Promise.all(responses.slice(1));
    expect(later.map((response) => response.status)).toEqual([200, 200, 200]);
    releaseFirst();
    const first = await responses[0]!;

    expect(first.status).toBe(429);
    expect((await errorOf(first))?.details?.code).toBe('large_file_intakes_in_flight');
    expect(rowsOf(USER_ID).filter((row) => NON_TERMINAL.has(row.state))).toHaveLength(3);
    expect(rowsOf(USER_ID)).toHaveLength(3);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toHaveLength(3);
    expect(await dailyBytes()).toBe(3 * LARGE_BYTES);
  });

  it('takes the person’s create lock before it writes the row, and writes it inside the transaction', async () => {
    await openLarge();

    expect(scopedDb.transaction).toHaveBeenCalledTimes(1);
    expect(scopedDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [`agi:chat-file-intake:${USER_ID}`],
    );
    const lockOrder = scopedDb.execute.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(large.insertIntake.mock.invocationCallOrder[0]!);
    expect(large.insertIntake.mock.calls[0]![0]).not.toBe(scopedDb);
  });

  it('leaves no row behind when the slot check refuses the create inside the transaction', async () => {
    seedInFlight(2, MIB);
    const counted = large.countInFlightIntakes.getMockImplementation()!;
    let calls = 0;
    large.countInFlightIntakes.mockImplementation(async (db, input) => {
      calls += 1;
      const inFlight = await counted(db, input);
      if (calls === 1) seedInFlight(3, MIB);
      return inFlight;
    });

    const response = await createLarge();

    expect(response.status).toBe(429);
    expect(rowsOf(USER_ID)).toHaveLength(3);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toEqual([]);
    expect(await dailyBytes()).toBe(0);
  });

  it('records the validated conversation on the intake row', async () => {
    const completion = await import('@/lib/server/chat-attachment-completion');
    const conversationId = '22222222-2222-4222-8222-222222222222';
    vi.mocked(completion.resolveTemporaryChatUpload).mockResolvedValue({
      temporary: false,
      conversationId,
    });

    expect((await createLarge({ conversationId })).status).toBe(200);

    expect(vi.mocked(completion.resolveTemporaryChatUpload)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, conversationId }),
    );
    expect(rowsOf(USER_ID)).toEqual([expect.objectContaining({ conversationId })]);
  });

  it('records no conversation for an id the caller does not own', async () => {
    const completion = await import('@/lib/server/chat-attachment-completion');
    const foreign = '33333333-3333-4333-8333-333333333333';
    vi.mocked(completion.resolveTemporaryChatUpload).mockResolvedValue({
      temporary: false,
      conversationId: null,
    });

    expect((await createLarge({ conversationId: foreign })).status).toBe(200);

    expect(rowsOf(USER_ID)).toEqual([expect.objectContaining({ conversationId: null })]);
  });

  it('never lets two creates that overlap on the last free storage both keep it', async () => {
    const { getFileStorageLimitBytes } = await import('@/lib/services/free-plan-entitlements');
    const limit = getFileStorageLimitBytes(large.planTier)!;
    seedInFlight(1, limit - LARGE_BYTES - 1);
    const summed = large.sumInFlightIntakeBytes.getMockImplementation()!;
    let arrived = 0;
    let release: () => void = () => undefined;
    const bothSummed = new Promise<void>((resolve) => {
      release = resolve;
    });
    large.sumInFlightIntakeBytes.mockImplementation(async (db, input) => {
      const declared = await summed(db, input);
      arrived += 1;
      if (arrived === 2) release();
      if (arrived <= 2) await bothSummed;
      return declared;
    });

    const responses = await Promise.all([createLarge(), createLarge()]);
    const admitted = responses.filter((response) => response.status === 200).length;

    expect(admitted).toBeLessThanOrEqual(1);
    expect(responses.map((response) => response.status)).toContain(413);
    expect(await store.current?.listPendingMultipartUploads(PRIVATE_BUCKET)).toHaveLength(admitted);
    expect(await dailyBytes()).toBe(admitted * LARGE_BYTES);
  });

  it('answers a large session from a relay origin with 409, never a relay URL', async () => {
    const opened = await openLarge();

    const response = await signLargeParts(opened, RELAY_ORIGIN);

    expect(response.status).toBe(409);
    const error = await errorOf(response);
    expect(error?.details?.code).toBe('large_file_needs_direct_upload');
    expect(JSON.stringify(error)).not.toContain('/api/files/uploads/');
    expect(large.touchPartRequest).not.toHaveBeenCalled();
  });

  it('signs a large session’s parts straight to storage from a listed origin and notes the request', async () => {
    const opened = await openLarge();
    vi.stubEnv('UPLOAD_STORAGE_CORS_ORIGINS', RELAY_ORIGIN);

    const response = await signLargeParts(opened, RELAY_ORIGIN);
    const body = (await response.json()) as { parts: { url: string; segmentBytes?: number }[] };

    expect(response.status).toBe(200);
    expect(new URL(body.parts[0]!.url).origin).toBe('https://objects.example.test');
    expect(body.parts[0]!.segmentBytes).toBeUndefined();
    expect(large.touchPartRequest).toHaveBeenCalledTimes(1);
  });

  it('signs a native client’s large-session parts straight to storage on a host that relays small files', async () => {
    const opened = await openLarge();

    const response = await signLargeParts(opened, undefined, RELAY_ORIGIN);
    const body = (await response.json()) as { parts: { url: string; segmentBytes?: number }[] };

    expect(response.status).toBe(200);
    expect(new URL(body.parts[0]!.url).origin).toBe('https://objects.example.test');
    expect(body.parts[0]!.segmentBytes).toBeUndefined();
    expect(large.touchPartRequest).toHaveBeenCalledTimes(1);
  });

  it('refuses parts for a large session whose intake already ended', async () => {
    const opened = await openLarge();
    await abortLarge(opened);

    const response = await signLargeParts(opened);

    expect(response.status).toBe(404);
  });

  it('refuses to relay a large session’s part through the web host', async () => {
    const opened = await openLarge();

    const response = await relayPart(
      createRequest(`${sessionUrl(opened)}&partNumber=1`, {
        method: 'PUT',
        body: new Uint8Array(16) as BodyInit,
      }),
      context(opened.uploadId),
    );

    expect(response.status).toBe(409);
  });

  it('completes a large session with 202 and starts the intake workflow, and a repeat answers the same intake', async () => {
    const opened = await openLarge();
    const key = await pendingKey();
    await storeAllParts(opened, key);
    const intakeId = [...intakes.keys()][0]!;

    const completed = await finish(opened);

    expect(completed.status).toBe(202);
    expect(await completed.json()).toMatchObject({
      kind: 'chat-attachment-intake',
      intake: { id: intakeId },
    });
    expect(large.startWorkflow).toHaveBeenCalledWith({
      intakeId,
      userId: USER_ID,
      organizationId: null,
    });
    expect(mockCompleteChatAttachmentUpload).not.toHaveBeenCalled();

    const repeated = await finish(opened);
    expect(repeated.status).toBe(202);
    expect(await repeated.json()).toMatchObject({ intake: { id: intakeId } });
    expect(large.startWorkflow).toHaveBeenCalledTimes(1);
  });

  it('deletes the staging object when a complete finds no intake row to move', async () => {
    const opened = await openLarge();
    const key = await pendingKey();
    await storeAllParts(opened, key);
    intakes.clear();

    const completed = await finish(opened);

    expect(completed.status).toBe(404);
    expect(await store.current?.head(PRIVATE_BUCKET, key)).toBeNull();
    expect(large.startWorkflow).not.toHaveBeenCalled();
  });

  describe('a chat-attachment session on a database without the intake tables', () => {
    beforeEach(async () => {
      const { createSchemaAbsentDb } =
        await import('@/lib/server/chat-file-intake/__tests__/schema-absent-db');
      mockGetUserScopedDb.mockResolvedValue({
        db: createSchemaAbsentDb(scopedDb as never),
        userId: USER_ID,
        organizationId: null,
      });
    });

    function intakeCalls() {
      return [
        large.insertIntake,
        large.touchPartRequest,
        large.markUploaded,
        large.readIntakeStatus,
        large.countInFlightIntakes,
        large.sumInFlightIntakeBytes,
        large.cancelIntakeByStagingKey,
      ].reduce((sum, fn) => sum + fn.mock.calls.length, 0);
    }

    it('signs its parts, completes it synchronously and issues no intake statement', async () => {
      const opened = await openUpload();
      expect((await signLargeParts(opened)).status).toBe(200);
      await sendPart(opened, 1, PART_ONE);
      await sendPart(opened, 2, PART_TWO);

      const completed = await finish(opened);

      expect(completed.status).toBe(200);
      expect((await completed.json()).kind).toBe('chat-attachment');
      expect(intakeCalls()).toBe(0);
      expect(large.startWorkflow).not.toHaveBeenCalled();
    });

    it('aborts it and issues no intake statement', async () => {
      const opened = await openUpload();

      expect((await abortLarge(opened)).status).toBe(200);
      expect(intakeCalls()).toBe(0);
    });
  });
});
