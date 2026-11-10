import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockNeonQuery, mockGetPresignedUploadUrl, mockGetPresignedPrivateUploadUrl } = vi.hoisted(
  () => ({
    mockNeonQuery: vi.fn(),
    mockGetPresignedUploadUrl: vi.fn(),
    mockGetPresignedPrivateUploadUrl: vi.fn(),
  }),
);

vi.mock('@/lib/server/attachment-allowance', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  admitAttachmentUpload: vi.fn(async () => undefined),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mockNeonQuery(...args),
      execute: vi.fn().mockResolvedValue(1),
      transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
      withUser: vi.fn(() => ({})),
      dispose: vi.fn(),
    },
    userId: 'user-abc',
    organizationId: '11111111-1111-4111-8111-111111111111',
  })),
}));
vi.mock('@/lib/server/object-storage', () => ({
  putPrivateObject: vi.fn(async ({ key }: { key: string }) => ({ key })),
  copyPrivateObjectIfUnchanged: vi.fn(),
  isObjectStorageConfigured: vi.fn(() => true),
  isPrivateObjectStorageConfigured: vi.fn(() => true),
  getPresignedUploadUrl: mockGetPresignedUploadUrl,
  getPresignedPrivateUploadUrl: mockGetPresignedPrivateUploadUrl,
  deleteObject: vi.fn(),
  deletePrivateObject: vi.fn(),
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: vi.fn(),
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
}));
vi.mock('@/lib/server/object-storage-runtime', () => ({
  getObjectStore: vi.fn(),
  objectStorageConfig: () => ({ secretAccessKey: 'test-object-storage-secret' }),
}));

import { POST } from '@/app/api/uploads/presign/route';
import { PROJECT_KNOWLEDGE_UPLOAD_PROTOCOL_VERSION } from '@agiworkforce/cloud-contracts';

const CHECKSUM = createHash('sha256').update('project source bytes').digest('hex');
const ENCRYPTION_HEADERS = {
  'x-amz-server-side-encryption': 'aws:kms',
  'x-amz-server-side-encryption-aws-kms-key-id': 'key-id',
};

type PresignBody = {
  kind: 'avatar' | 'knowledge-file' | 'chat-attachment';
  fileName: string;
  mimeType: string;
  byteCount: number;
  projectId?: string;
  uploadProtocolVersion?: number;
  checksumSha256?: string;
};

function presignRequest(body: PresignBody, origin = 'http://localhost:3000'): NextRequest {
  const authorized: PresignBody =
    body.kind === 'knowledge-file'
      ? {
          uploadProtocolVersion: PROJECT_KNOWLEDGE_UPLOAD_PROTOCOL_VERSION,
          checksumSha256: CHECKSUM,
          projectId: 'proj-1',
          ...body,
        }
      : body;
  return new NextRequest(`${origin}/api/uploads/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'csrf-fixture' },
    body: JSON.stringify(authorized),
  });
}

const AVATAR: PresignBody = {
  kind: 'avatar',
  fileName: 'me.png',
  mimeType: 'image/png',
  byteCount: 1024,
};
const CHAT_ATTACHMENT: PresignBody = {
  kind: 'chat-attachment',
  fileName: 'notes.txt',
  mimeType: 'text/plain',
  byteCount: 1024,
};
const KNOWLEDGE_FILE: PresignBody = {
  kind: 'knowledge-file',
  fileName: 'notes.txt',
  mimeType: 'text/plain',
  byteCount: 1024,
};

beforeEach(() => {
  mockNeonQuery.mockResolvedValue([{ id: 'proj-1' }]);
  mockGetPresignedUploadUrl.mockReset();
  mockGetPresignedPrivateUploadUrl.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/uploads/presign · server-side encryption', () => {
  it('returns the encryption headers of a direct avatar upload beside its content type', async () => {
    mockGetPresignedUploadUrl.mockResolvedValue({
      uploadUrl: 'https://r2.test/signed',
      uploadHeaders: ENCRYPTION_HEADERS,
      publicUrl: 'https://cdn.test/object',
    });

    const response = await POST(presignRequest(AVATAR));

    expect(response.status).toBe(200);
    expect((await response.json()).uploadHeaders).toEqual({
      'Content-Type': 'image/png',
      ...ENCRYPTION_HEADERS,
    });
  });

  it.each([
    ['chat-attachment', CHAT_ATTACHMENT],
    ['knowledge-file', KNOWLEDGE_FILE],
  ])('returns the encryption headers of a direct %s upload', async (_kind, body) => {
    mockGetPresignedPrivateUploadUrl.mockResolvedValue({
      uploadUrl: 'https://r2.test/private-signed',
      uploadHeaders: ENCRYPTION_HEADERS,
    });

    const response = await POST(presignRequest(body));

    expect(response.status).toBe(200);
    expect((await response.json()).uploadHeaders).toEqual({
      'Content-Type': 'text/plain',
      ...ENCRYPTION_HEADERS,
    });
  });

  it('returns only the content type when the host requires nothing else', async () => {
    mockGetPresignedUploadUrl.mockResolvedValue({
      uploadUrl: 'https://r2.test/signed',
      uploadHeaders: {},
      publicUrl: 'https://cdn.test/object',
    });

    const response = await POST(presignRequest(AVATAR));

    expect((await response.json()).uploadHeaders).toEqual({ 'Content-Type': 'image/png' });
  });

  it('refuses a host header that would replace the signed content type', async () => {
    mockGetPresignedUploadUrl.mockResolvedValue({
      uploadUrl: 'https://r2.test/signed',
      uploadHeaders: { 'content-type': 'text/html' },
      publicUrl: 'https://cdn.test/object',
    });

    const response = await POST(presignRequest(AVATAR));

    expect(response.status).toBeGreaterThanOrEqual(500);
  });

  it.each([
    ['chat-attachment', CHAT_ATTACHMENT],
    ['knowledge-file', KNOWLEDGE_FILE],
  ])(
    'leaves the encryption to the server when a %s upload is relayed through this origin',
    async (_kind, body) => {
      vi.stubEnv('VERCEL_ENV', 'preview');
      mockGetPresignedPrivateUploadUrl.mockResolvedValue({
        uploadUrl: 'https://r2.test/private-signed',
        uploadHeaders: ENCRYPTION_HEADERS,
      });

      const response = await POST(presignRequest(body, 'https://preview.agiworkforce.test'));

      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.uploadUrl).toContain('/api/uploads/');
      expect(Object.keys(json.uploadHeaders)).not.toContain('x-amz-server-side-encryption');
      expect(mockGetPresignedPrivateUploadUrl).not.toHaveBeenCalled();
    },
  );
});
