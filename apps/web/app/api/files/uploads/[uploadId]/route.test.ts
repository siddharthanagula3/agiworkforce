type OriginalProjectKnowledgeFilesModule = typeof import('@/lib/server/project-knowledge-files');
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  store: {
    uploadPart: vi.fn(),
    listUploadedParts: vi.fn(),
    completeMultipartUpload: vi.fn(),
    listPendingMultipartUploads: vi.fn(),
    head: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    abortMultipartUpload: vi.fn(),
  },
  intake: {
    markUploaded: vi.fn(),
    readIntakeStatus: vi.fn(),
    cancelIntakeByStagingKey: vi.fn(),
    startWorkflow: vi.fn(),
  },
  transitions: {
    cancelChatFileIntake: vi.fn(),
    defaultIntakeTransitionDeps: vi.fn((db: unknown, ownerUserId: string) => ({
      db,
      ownerUserId,
    })),
  },
  staged: new Map<string, Uint8Array>(),
  completeChatAttachmentUpload: vi.fn(),
  findCompletedChatAttachment: vi.fn(),
  findProjectKnowledgeFileByChecksum: vi.fn(),
  registerProjectKnowledgeFile: vi.fn(),
  deleteProjectKnowledgeObject: vi.fn(),
  session: {
    v: 1,
    userId: 'user-1',
    organizationId: null,
    kind: 'chat-attachment',
    key: 'chat-attachments/user-1/1_abc.pdf',
    uploadId: 'upload-1',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    byteCount: 12,
    partBytes: 8,
    checksumSha256: 'a'.repeat(64),
    projectId: null as string | null,
    sourceSurface: null as string | null,
    intakeId: undefined as string | undefined,
    expiresAt: Number.MAX_SAFE_INTEGER,
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: null })),
}));
vi.mock('@/lib/server/product-analytics', () => ({
  resolveProductAnalyticsSurface: () => 'web',
  trackProductAnalyticsEvent: vi.fn(),
}));
vi.mock('@/lib/server/chat-attachment-completion', () => ({
  completeChatAttachmentUpload: (...args: unknown[]) =>
    mocks.completeChatAttachmentUpload(...(args as [])),
  findCompletedChatAttachment: mocks.findCompletedChatAttachment,
  resolveTemporaryChatUpload: vi.fn(async () => ({ temporary: false, conversationId: null })),
  resolveUploadSourceSurface: () => 'web',
}));
vi.mock('@/lib/server/project-knowledge-files', async (importOriginal) => ({
  ...(await importOriginal<OriginalProjectKnowledgeFilesModule>()),
  findProjectKnowledgeFileByChecksum: mocks.findProjectKnowledgeFileByChecksum,
  registerProjectKnowledgeFile: (...args: unknown[]) =>
    mocks.registerProjectKnowledgeFile(...(args as [])),
}));
vi.mock('@/lib/server/project-knowledge-object-storage', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  deleteProjectKnowledgeObject: (...args: unknown[]) =>
    mocks.deleteProjectKnowledgeObject(...(args as [])),
  sealProjectKnowledgeObject: vi.fn(),
}));
vi.mock('@/lib/server/chat-file-intake/store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  markUploaded: (...args: unknown[]) => mocks.intake.markUploaded(...args),
  readIntakeStatus: (...args: unknown[]) => mocks.intake.readIntakeStatus(...args),
  cancelIntakeByStagingKey: (...args: unknown[]) => mocks.intake.cancelIntakeByStagingKey(...args),
}));
vi.mock('@/lib/server/chat-file-intake/transitions', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  cancelChatFileIntake: (...args: unknown[]) => mocks.transitions.cancelChatFileIntake(...args),
  defaultIntakeTransitionDeps: (db: unknown, ownerUserId: string) =>
    mocks.transitions.defaultIntakeTransitionDeps(db, ownerUserId),
}));
vi.mock('@/lib/workflows/start-chat-file-intake-workflow', () => ({
  startChatFileIntakeWorkflow: (...args: unknown[]) => mocks.intake.startWorkflow(...args),
  dispatchChatFileIntakeWorkflows: vi.fn(),
}));
vi.mock('../resumable-upload', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readResumableUploadSession: vi.fn(async () => mocks.session),
    resumableUploadTarget: () => ({ store: mocks.store, bucket: 'private' }),
  };
});

import {
  ManagedCloudResumableUploadAbortResponseSchema,
  RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES,
} from '@agiworkforce/cloud-contracts';
import { readResumableUploadSession } from '../resumable-upload';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { logger } from '@/lib/logger';
import {
  ChatFileSchemaReachedError,
  createSchemaAbsentDb,
} from '@/lib/server/chat-file-intake/__tests__/schema-absent-db';
import { intakeRow } from '@/lib/server/chat-file-intake/__tests__/memory-intake-store';
import { DELETE, POST, PUT } from './route';

const context = { params: Promise.resolve({ uploadId: 'upload-1' }) };

function partRequest(partNumber: number, body: Uint8Array, offset?: number): NextRequest {
  const at = offset === undefined ? '' : `&offset=${offset}`;
  const url = `http://localhost/api/files/uploads/upload-1?session=token&partNumber=${partNumber}${at}`;
  return new NextRequest(url, { method: 'PUT', body: body as BodyInit }) as never;
}

function completeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/files/uploads/upload-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session: 'token' }),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.byteCount = 12;
  mocks.session.partBytes = 8;
  mocks.staged.clear();
  mocks.store.put.mockImplementation(async ({ key, body }: { key: string; body: Uint8Array }) => {
    mocks.staged.set(key, body);
  });
  mocks.store.get.mockImplementation(async (_bucket: string, key: string) => {
    const data = mocks.staged.get(key);
    return data ? { data, contentType: 'application/octet-stream' } : null;
  });
  mocks.store.delete.mockImplementation(async (_bucket: string, key: string) => {
    mocks.staged.delete(key);
  });
  mocks.session.kind = 'chat-attachment';
  mocks.session.intakeId = undefined;
  mocks.session.projectId = null;
  mocks.session.sourceSurface = null;
  mocks.findCompletedChatAttachment.mockResolvedValue(null);
  mocks.findProjectKnowledgeFileByChecksum.mockResolvedValue(null);
  mocks.store.uploadPart.mockImplementation(
    async ({ partNumber, body }: { partNumber: number; body: Uint8Array }) => ({
      partNumber,
      etag: `etag-${partNumber}`,
      size: body.byteLength,
      checksumSha256: '',
    }),
  );
  mocks.store.listUploadedParts.mockResolvedValue([
    { partNumber: 1, etag: 'etag-1', size: 8, checksumSha256: '' },
    { partNumber: 2, etag: 'etag-2', size: 4, checksumSha256: '' },
  ]);
  mocks.store.completeMultipartUpload.mockResolvedValue(undefined);
  mocks.store.listPendingMultipartUploads.mockResolvedValue([
    { key: mocks.session.key, uploadId: 'upload-1', initiatedAtMs: 0 },
  ]);
  mocks.completeChatAttachmentUpload.mockResolvedValue({
    id: '3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31',
    name: 'report.pdf',
    mimeType: 'application/pdf',
    byteCount: 12,
    type: 'file',
    url: '/api/files/3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31',
  });
  mocks.deleteProjectKnowledgeObject.mockResolvedValue(undefined);
});

describe('PUT a relayed part', () => {
  it('stores every part at the size the session assigned it', async () => {
    const parts = [new Uint8Array(8).fill(1), new Uint8Array(4).fill(2)];

    for (const [index, body] of parts.entries()) {
      const response = await PUT(partRequest(index + 1, body), context);
      expect(response.status, `part ${index + 1} was refused`).toBe(200);
    }

    expect(mocks.store.uploadPart).toHaveBeenCalledTimes(2);
    expect(mocks.store.uploadPart).toHaveBeenCalledWith(
      expect.objectContaining({ key: mocks.session.key, uploadId: 'upload-1', partNumber: 2 }),
    );
  });

  it('refuses a part whose size would break the assembled file', async () => {
    const response = await PUT(partRequest(1, new Uint8Array(4)), context);

    expect(response.status).toBe(400);
    expect(mocks.store.uploadPart).not.toHaveBeenCalled();
  });
});

describe('PUT a relayed part in segments the web host can carry', () => {
  const SEGMENT = RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES;

  function segmentedSession() {
    mocks.session.partBytes = SEGMENT + 4;
    mocks.session.byteCount = SEGMENT + 4 + 2;
  }

  it('holds the first segment and stores the whole part when the last one arrives', async () => {
    segmentedSession();

    const first = await PUT(partRequest(1, new Uint8Array(SEGMENT).fill(1), 0), context);
    expect(first.status).toBe(200);
    expect(mocks.store.uploadPart).not.toHaveBeenCalled();
    expect(mocks.staged.size).toBe(1);
    expect([...mocks.staged.keys()][0]).toMatch(/^relay-segments\/user-1\//);

    const last = await PUT(partRequest(1, new Uint8Array(4).fill(2), SEGMENT), context);
    expect(last.status).toBe(200);
    await expect(last.json()).resolves.toEqual({ part: { partNumber: 1, size: SEGMENT + 4 } });
    const stored = mocks.store.uploadPart.mock.calls[0]?.[0] as { body: Uint8Array };
    expect(stored.body.byteLength).toBe(SEGMENT + 4);
    expect(stored.body[SEGMENT - 1]).toBe(1);
    expect(Array.from(stored.body.subarray(SEGMENT))).toEqual([2, 2, 2, 2]);
    expect(mocks.staged.size).toBe(0);
  });

  it('stores a part that fits one request without holding anything', async () => {
    segmentedSession();

    const response = await PUT(partRequest(2, new Uint8Array(2).fill(3), 0), context);

    expect(response.status).toBe(200);
    expect(mocks.store.put).not.toHaveBeenCalled();
    expect(mocks.store.uploadPart).toHaveBeenCalledWith(
      expect.objectContaining({ partNumber: 2, body: new Uint8Array(2).fill(3) }),
    );
  });

  it('refuses the last segment when an earlier one never arrived', async () => {
    segmentedSession();

    const response = await PUT(partRequest(1, new Uint8Array(4).fill(2), SEGMENT), context);

    expect(response.status).toBe(409);
    expect(mocks.store.uploadPart).not.toHaveBeenCalled();
  });

  it('refuses a segment that does not start on a segment boundary', async () => {
    segmentedSession();

    const response = await PUT(partRequest(1, new Uint8Array(4), 3), context);

    expect(response.status).toBe(400);
    expect(mocks.store.put).not.toHaveBeenCalled();
  });
});

describe('POST to complete', () => {
  it('returns an existing receipt before reading multipart storage', async () => {
    const attachment = {
      id: '3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      byteCount: 12,
      type: 'file',
      url: '/api/files/3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31',
    };
    mocks.findCompletedChatAttachment.mockResolvedValueOnce(attachment);
    mocks.store.listUploadedParts.mockRejectedValue(new Error('Storage unavailable'));

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: 'chat-attachment', attachment });
    expect(mocks.store.listUploadedParts).not.toHaveBeenCalled();
    expect(mocks.store.completeMultipartUpload).not.toHaveBeenCalled();
    expect(mocks.store.head).not.toHaveBeenCalled();
    expect(mocks.completeChatAttachmentUpload).not.toHaveBeenCalled();
  });

  it('joins the parts before the chat attachment pipeline reads them', async () => {
    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: 'chat-attachment' });
    expect(mocks.completeChatAttachmentUpload.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.store.completeMultipartUpload.mock.invocationCallOrder[0]!,
    );
    expect(mocks.completeChatAttachmentUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: mocks.session.key,
        checksumSha256: mocks.session.checksumSha256,
      }),
    );
  });

  it('retains an assembled project source after a non-safety registration refusal', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.session.kind = 'knowledge-file';
    mocks.session.projectId = 'project-1';
    mocks.session.sourceSurface = 'web';
    mocks.registerProjectKnowledgeFile.mockRejectedValue(
      createError.validation('Project storage is full.'),
    );

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(400);
    expect(mocks.deleteProjectKnowledgeObject).not.toHaveBeenCalled();
    expect(mocks.findProjectKnowledgeFileByChecksum).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', organizationId: null, projectId: 'project-1' }),
      mocks.session.checksumSha256,
      mocks.session.key,
    );
    expect(mocks.completeChatAttachmentUpload).not.toHaveBeenCalled();
  });
});

const INTAKE_ID = '3f6a2c1e-9b8d-4e7f-a1b2-c3d4e5f60718';

function abortRequest(): NextRequest {
  return new NextRequest('http://localhost/api/files/uploads/upload-1?session=token', {
    method: 'DELETE',
  }) as never;
}

function largeSession() {
  mocks.session.kind = 'chat-large-file';
  mocks.session.intakeId = INTAKE_ID;
  mocks.session.byteCount = 12;
}

describe('a chat-large-file session', () => {
  beforeEach(() => {
    largeSession();
    mocks.intake.startWorkflow.mockResolvedValue('run-1');
    mocks.store.abortMultipartUpload.mockResolvedValue(undefined);
    mocks.transitions.cancelChatFileIntake.mockResolvedValue({ outcome: 'missing' });
  });

  it('answers 202 with the intake and starts its workflow once the parts are joined', async () => {
    mocks.intake.markUploaded.mockResolvedValue(intakeRow({ id: INTAKE_ID, state: 'uploaded' }));

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      kind: 'chat-attachment-intake',
      intake: { id: INTAKE_ID },
    });
    expect(mocks.intake.markUploaded).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: 'user-1', stagingKey: mocks.session.key }),
    );
    expect(mocks.intake.startWorkflow).toHaveBeenCalledWith({
      intakeId: INTAKE_ID,
      userId: 'user-1',
      organizationId: null,
    });
    expect(mocks.completeChatAttachmentUpload).not.toHaveBeenCalled();
    expect(mocks.findCompletedChatAttachment).not.toHaveBeenCalled();
  });

  it('still answers 202 when the workflow does not start, leaving the sweeper to start it', async () => {
    mocks.intake.markUploaded.mockResolvedValue(intakeRow({ id: INTAKE_ID, state: 'uploaded' }));
    mocks.intake.startWorkflow.mockRejectedValue(new Error('workflow down'));

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(202);
  });

  it('answers a repeated complete with the running intake and starts nothing', async () => {
    mocks.store.listUploadedParts.mockRejectedValue(new Error('NoSuchUpload'));
    mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
    mocks.store.head.mockResolvedValue({ size: 12 });
    mocks.intake.markUploaded.mockResolvedValue(null);
    mocks.intake.readIntakeStatus.mockResolvedValue(
      intakeRow({ id: INTAKE_ID, state: 'scanning', attempts: 1 }),
    );

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ intake: { id: INTAKE_ID } });
    expect(mocks.intake.startWorkflow).not.toHaveBeenCalled();
    expect(mocks.store.delete).not.toHaveBeenCalled();
  });

  it('tells a repeated complete that the file is gone when its sealed file was deleted since', async () => {
    mocks.store.listUploadedParts.mockRejectedValue(new Error('NoSuchUpload'));
    mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
    mocks.store.head.mockResolvedValue(null);
    mocks.intake.markUploaded.mockResolvedValue(null);
    mocks.intake.readIntakeStatus.mockResolvedValue(
      intakeRow({ id: INTAKE_ID, state: 'sealed', mediaAssetId: null }),
    );

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe(
      'This file is no longer stored. Attach it again to use it.',
    );
    expect(mocks.store.delete).not.toHaveBeenCalled();
  });

  it('answers a repeated complete with the file of a sealed intake that still has it', async () => {
    const mediaAssetId = '3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31';
    mocks.store.listUploadedParts.mockRejectedValue(new Error('NoSuchUpload'));
    mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
    mocks.store.head.mockResolvedValue(null);
    mocks.intake.markUploaded.mockResolvedValue(null);
    mocks.intake.readIntakeStatus.mockResolvedValue(
      intakeRow({ id: INTAKE_ID, state: 'sealed', mediaAssetId }),
    );

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      intake: { id: INTAKE_ID, state: 'ready', attachment: { id: mediaAssetId } },
    });
  });

  it('deletes the staging object when no intake row moves to uploaded', async () => {
    mocks.intake.markUploaded.mockResolvedValue(null);
    mocks.intake.readIntakeStatus.mockResolvedValue(null);

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(404);
    expect(mocks.store.delete).toHaveBeenCalledWith('private', mocks.session.key);
    expect(mocks.intake.startWorkflow).not.toHaveBeenCalled();
  });

  it('deletes the staging object of an intake that ended without a seal', async () => {
    mocks.intake.markUploaded.mockResolvedValue(null);
    mocks.intake.readIntakeStatus.mockResolvedValue(
      intakeRow({ id: INTAKE_ID, state: 'cancelled', cancelReason: 'client' }),
    );

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(202);
    expect(mocks.store.delete).toHaveBeenCalledWith('private', mocks.session.key);
  });

  it('aborts the upload, then cancels the intake with the bytes the parts stored', async () => {
    mocks.store.listUploadedParts.mockResolvedValue([
      { partNumber: 1, etag: 'etag-1', size: 8, checksumSha256: '' },
    ]);

    const response = await DELETE(abortRequest(), context);

    expect(response.status).toBe(200);
    expect(mocks.store.abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect(mocks.intake.cancelIntakeByStagingKey).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: 'user-1', stagingKey: mocks.session.key, storedBytes: 8 }),
    );
    expect(mocks.store.abortMultipartUpload.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.intake.cancelIntakeByStagingKey.mock.invocationCallOrder[0]!,
    );
  });

  it('refunds nothing when the stored parts cannot be listed', async () => {
    mocks.store.listUploadedParts.mockRejectedValue(new Error('storage unreachable'));

    await DELETE(abortRequest(), context);

    expect(mocks.intake.cancelIntakeByStagingKey).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ storedBytes: mocks.session.byteCount }),
    );
  });

  it('leaves the intake alone once the awaiting row it named was cancelled', async () => {
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(
      intakeRow({ id: INTAKE_ID, state: 'cancelled', cancelReason: 'client' }),
    );

    const response = await DELETE(abortRequest(), context);

    expect(response.status).toBe(200);
    expect(mocks.transitions.cancelChatFileIntake).not.toHaveBeenCalled();
  });

  it('cancels, as its owner, an intake the complete already moved to uploaded', async () => {
    mocks.store.abortMultipartUpload.mockRejectedValue(new Error('NoSuchUpload'));
    mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
    mocks.transitions.cancelChatFileIntake.mockResolvedValue({
      outcome: 'cancelled',
      row: intakeRow({ id: INTAKE_ID, state: 'cancelled', cancelReason: 'client' }),
    });

    const response = await DELETE(abortRequest(), context);

    expect(response.status).toBe(200);
    expect(mocks.transitions.defaultIntakeTransitionDeps).toHaveBeenCalledWith({}, 'user-1');
    expect(mocks.transitions.cancelChatFileIntake).toHaveBeenCalledWith(
      { db: {}, ownerUserId: 'user-1' },
      { userId: 'user-1', intakeId: INTAKE_ID },
    );
    expect(mocks.intake.cancelIntakeByStagingKey.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.transitions.cancelChatFileIntake.mock.invocationCallOrder[0]!,
    );
  });

  it('records an abort that arrived after the intake could no longer be cancelled', async () => {
    mocks.store.abortMultipartUpload.mockRejectedValue(new Error('NoSuchUpload'));
    mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
    mocks.transitions.cancelChatFileIntake.mockResolvedValue({
      outcome: 'not_cancellable',
      row: intakeRow({ id: INTAKE_ID, state: 'sealing' }),
    });

    const response = await DELETE(abortRequest(), context);

    expect(response.status).toBe(200);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      { intakeId: INTAKE_ID, state: 'sealing' },
      expect.stringContaining('could no longer be cancelled'),
    );
  });

  it.each(['sealing', 'sealed'] as const)(
    'names the intake that was %s when the cancel came too late',
    async (state) => {
      mocks.store.abortMultipartUpload.mockRejectedValue(new Error('NoSuchUpload'));
      mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
      mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
      mocks.transitions.cancelChatFileIntake.mockResolvedValue({
        outcome: 'not_cancellable',
        row: intakeRow({ id: INTAKE_ID, state }),
      });

      const response = await DELETE(abortRequest(), context);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ aborted: true, intake: { id: INTAKE_ID } });
      expect(ManagedCloudResumableUploadAbortResponseSchema.safeParse(body).success).toBe(true);
    },
  );

  it.each(['rejected', 'failed'] as const)(
    'adds no intake to the answer when the intake already ended %s',
    async (state) => {
      mocks.store.abortMultipartUpload.mockRejectedValue(new Error('NoSuchUpload'));
      mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
      mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
      mocks.transitions.cancelChatFileIntake.mockResolvedValue({
        outcome: 'not_cancellable',
        row: intakeRow({ id: INTAKE_ID, state }),
      });

      const response = await DELETE(abortRequest(), context);

      expect(await response.json()).toEqual({ aborted: true });
    },
  );

  it('cancels once more when the row fell back to a cancellable state before it was read', async () => {
    mocks.store.abortMultipartUpload.mockRejectedValue(new Error('NoSuchUpload'));
    mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
    mocks.transitions.cancelChatFileIntake
      .mockResolvedValueOnce({
        outcome: 'not_cancellable',
        row: intakeRow({ id: INTAKE_ID, state: 'scanning' }),
      })
      .mockResolvedValueOnce({
        outcome: 'cancelled',
        row: intakeRow({ id: INTAKE_ID, state: 'cancelled', cancelReason: 'client' }),
      });

    const response = await DELETE(abortRequest(), context);

    expect(mocks.transitions.cancelChatFileIntake).toHaveBeenCalledTimes(2);
    expect(await response.text()).toBe('{"aborted":true}');
  });

  it('names the intake when it moved on to sealing between the two cancels', async () => {
    mocks.store.abortMultipartUpload.mockRejectedValue(new Error('NoSuchUpload'));
    mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
    mocks.transitions.cancelChatFileIntake
      .mockResolvedValueOnce({
        outcome: 'not_cancellable',
        row: intakeRow({ id: INTAKE_ID, state: 'scanning' }),
      })
      .mockResolvedValueOnce({
        outcome: 'not_cancellable',
        row: intakeRow({ id: INTAKE_ID, state: 'sealing' }),
      });

    const response = await DELETE(abortRequest(), context);

    expect(mocks.transitions.cancelChatFileIntake).toHaveBeenCalledTimes(2);
    expect(await response.json()).toEqual({ aborted: true, intake: { id: INTAKE_ID } });
  });

  it('names the intake after a second miss rather than leaving a file that may be added unannounced', async () => {
    mocks.store.abortMultipartUpload.mockRejectedValue(new Error('NoSuchUpload'));
    mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
    mocks.transitions.cancelChatFileIntake.mockResolvedValue({
      outcome: 'not_cancellable',
      row: intakeRow({ id: INTAKE_ID, state: 'scanning' }),
    });

    const response = await DELETE(abortRequest(), context);

    expect(mocks.transitions.cancelChatFileIntake).toHaveBeenCalledTimes(2);
    expect(await response.json()).toEqual({ aborted: true, intake: { id: INTAKE_ID } });
  });

  it.each(['sealing', 'sealed', 'rejected', 'failed'] as const)(
    'does not cancel again when the intake is %s',
    async (state) => {
      mocks.store.abortMultipartUpload.mockRejectedValue(new Error('NoSuchUpload'));
      mocks.store.listPendingMultipartUploads.mockResolvedValue([]);
      mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
      mocks.transitions.cancelChatFileIntake.mockResolvedValue({
        outcome: 'not_cancellable',
        row: intakeRow({ id: INTAKE_ID, state }),
      });

      await DELETE(abortRequest(), context);

      expect(mocks.transitions.cancelChatFileIntake).toHaveBeenCalledTimes(1);
    },
  );

  it('answers only that it aborted after a normal cancel', async () => {
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(
      intakeRow({ id: INTAKE_ID, state: 'cancelled', cancelReason: 'client' }),
    );

    const response = await DELETE(abortRequest(), context);

    expect(await response.text()).toBe('{"aborted":true}');
  });

  it('answers only that it aborted when the fallback cancel finds the intake cancelled', async () => {
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
    mocks.transitions.cancelChatFileIntake.mockResolvedValue({
      outcome: 'cancelled',
      row: intakeRow({ id: INTAKE_ID, state: 'cancelled', cancelReason: 'client' }),
    });

    const response = await DELETE(abortRequest(), context);

    expect(await response.text()).toBe('{"aborted":true}');
  });

  it('answers only that it aborted when no intake of the caller exists', async () => {
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
    mocks.transitions.cancelChatFileIntake.mockResolvedValue({ outcome: 'missing' });

    const response = await DELETE(abortRequest(), context);

    expect(await response.text()).toBe('{"aborted":true}');
  });

  it('refuses a signed session that belongs to another person and touches nothing', async () => {
    const actual =
      await vi.importActual<typeof import('../resumable-upload')>('../resumable-upload');
    const { token } = await actual.issueResumableUploadSession(
      mocks.session as unknown as Parameters<typeof actual.issueResumableUploadSession>[0],
    );
    vi.mocked(readResumableUploadSession).mockImplementationOnce(actual.readResumableUploadSession);
    vi.mocked(getUserScopedDb).mockResolvedValueOnce({
      db: {},
      userId: 'user-intruder',
      organizationId: null,
    } as never);
    const request = new NextRequest(
      `http://localhost/api/files/uploads/upload-1?session=${encodeURIComponent(token)}`,
      { method: 'DELETE' },
    );

    const response = await DELETE(request as never, context);

    expect(response.status).toBe(404);
    expect(mocks.store.abortMultipartUpload).not.toHaveBeenCalled();
    expect(mocks.intake.cancelIntakeByStagingKey).not.toHaveBeenCalled();
    expect(mocks.transitions.cancelChatFileIntake).not.toHaveBeenCalled();
  });

  it('records nothing when the intake it falls back to was cancelled', async () => {
    mocks.intake.cancelIntakeByStagingKey.mockResolvedValue(null);
    mocks.transitions.cancelChatFileIntake.mockResolvedValue({
      outcome: 'cancelled',
      row: intakeRow({ id: INTAKE_ID, state: 'cancelled', cancelReason: 'client' }),
    });

    await DELETE(abortRequest(), context);

    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
  });

  it('cancels the intake when the upload was already closed', async () => {
    mocks.store.abortMultipartUpload.mockRejectedValue(new Error('NoSuchUpload'));
    mocks.store.listPendingMultipartUploads.mockResolvedValue([]);

    const response = await DELETE(abortRequest(), context);

    expect(response.status).toBe(200);
    expect(mocks.intake.cancelIntakeByStagingKey).toHaveBeenCalledTimes(1);
  });
});

describe('a small-file session', () => {
  it('answers only that it aborted and cancels no intake', async () => {
    mocks.store.abortMultipartUpload.mockResolvedValue(undefined);

    const response = await DELETE(abortRequest(), context);

    expect(await response.text()).toBe('{"aborted":true}');
    expect(mocks.intake.cancelIntakeByStagingKey).not.toHaveBeenCalled();
    expect(mocks.transitions.cancelChatFileIntake).not.toHaveBeenCalled();
  });
});

describe('a chat-attachment session on a database without the intake tables', () => {
  beforeEach(() => {
    const delegate = { query: vi.fn(async () => []) };
    vi.mocked(getUserScopedDb).mockResolvedValue({
      db: createSchemaAbsentDb(delegate),
      userId: 'user-1',
      organizationId: null,
    } as never);
    mocks.store.abortMultipartUpload.mockResolvedValue(undefined);
    for (const fn of Object.values(mocks.intake)) {
      fn.mockImplementation(async (db: { query: (sql: string) => Promise<unknown> }) => {
        await db.query('select 1 from public.chat_file_intakes');
      });
    }
  });

  it('completes synchronously and issues no statement naming a new table', async () => {
    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(200);
    expect((await response.json()).kind).toBe('chat-attachment');
    for (const fn of Object.values(mocks.intake)) expect(fn).not.toHaveBeenCalled();
  });

  it('aborts and issues no statement naming a new table', async () => {
    const response = await DELETE(abortRequest(), context);

    expect(response.status).toBe(200);
    for (const fn of Object.values(mocks.intake)) expect(fn).not.toHaveBeenCalled();
  });

  it('would have refused an intake statement, so the absence above is measured', async () => {
    const { db } = await vi.mocked(getUserScopedDb)(new NextRequest('http://localhost/'));
    await expect(db.query('select 1 from public.chat_file_intakes')).rejects.toBeInstanceOf(
      ChatFileSchemaReachedError,
    );
  });
});
