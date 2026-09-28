import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  store: {
    uploadPart: vi.fn(),
    listUploadedParts: vi.fn(),
    completeMultipartUpload: vi.fn(),
    listPendingMultipartUploads: vi.fn(),
    head: vi.fn(),
  },
  completeChatAttachmentUpload: vi.fn(),
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
  findCompletedChatAttachment: vi.fn(async () => null),
  resolveTemporaryChatUpload: vi.fn(async () => false),
  resolveUploadSourceSurface: () => 'web',
}));
vi.mock('@/lib/server/project-knowledge-files', () => ({
  findProjectKnowledgeFileByChecksum: vi.fn(async () => null),
  registerProjectKnowledgeFile: (...args: unknown[]) =>
    mocks.registerProjectKnowledgeFile(...(args as [])),
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: (...args: unknown[]) =>
    mocks.deleteProjectKnowledgeObject(...(args as [])),
  sealProjectKnowledgeObject: vi.fn(),
}));
vi.mock('../resumable-upload', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readResumableUploadSession: vi.fn(async () => mocks.session),
    resumableUploadTarget: () => ({ store: mocks.store, bucket: 'private' }),
  };
});

import { POST, PUT } from './route';

const context = { params: Promise.resolve({ uploadId: 'upload-1' }) };

function partRequest(partNumber: number, body: Uint8Array): NextRequest {
  const url = `http://localhost/api/files/uploads/upload-1?session=token&partNumber=${partNumber}`;
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
  mocks.session.kind = 'chat-attachment';
  mocks.session.projectId = null;
  mocks.session.sourceSurface = null;
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

describe('POST to complete', () => {
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

  it('deletes an assembled project source its project refuses, and records nothing', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.session.kind = 'knowledge-file';
    mocks.session.projectId = 'project-1';
    mocks.session.sourceSurface = 'web';
    mocks.registerProjectKnowledgeFile.mockRejectedValue(
      createError.validation('Project storage is full.'),
    );

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(400);
    expect(mocks.deleteProjectKnowledgeObject).toHaveBeenCalledWith(mocks.session.key);
    expect(mocks.completeChatAttachmentUpload).not.toHaveBeenCalled();
  });
});
