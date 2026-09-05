import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetClerkAuthUser,
  mockNeonQuery,
  mockGetPresignedUploadUrl,
  mockGetPresignedPrivateUploadUrl,
  mockResolveActiveOrganizationId,
} = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockGetPresignedUploadUrl: vi.fn(),
  mockGetPresignedPrivateUploadUrl: vi.fn(),
  mockResolveActiveOrganizationId: vi.fn(),
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
    userId: (await mockGetClerkAuthUser()).userId,
    organizationId: await mockResolveActiveOrganizationId(),
  })),
}));
vi.mock('@/lib/server/object-storage', () => ({
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

import { POST } from '@/app/api/uploads/presign/route';

type PresignBody = {
  kind: 'avatar' | 'knowledge-file' | 'chat-attachment';
  fileName: string;
  mimeType: string;
  byteCount: number;
  projectId?: string;
};

function presignRequest(body: PresignBody, origin = 'http://localhost:3000'): NextRequest {
  // http://localhost:3000 is the one non-production origin the R2 CORS
  // policy allowlists (see scripts/r2-apply-cors.mjs); any other origin now
  // gets routed through the same-origin chat-attachment or knowledge-file
  // upload proxy instead of a direct presigned URL.
  return new NextRequest(`${origin}/api/uploads/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ALL_KINDS = ['avatar', 'knowledge-file', 'chat-attachment'] as const;

beforeEach(() => {
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mockResolveActiveOrganizationId.mockResolvedValue('11111111-1111-4111-8111-111111111111');
  mockNeonQuery.mockResolvedValue([{ id: 'proj-1' }]);
  mockGetPresignedUploadUrl.mockResolvedValue({
    uploadUrl: 'https://r2.test/signed',
    publicUrl: 'https://cdn.test/object',
  });
  mockGetPresignedPrivateUploadUrl.mockResolvedValue({
    uploadUrl: 'https://r2.test/private-signed',
  });
});

describe('POST /api/uploads/presign · type policy', () => {
  it.each(ALL_KINDS)('refuses to sign an SVG upload for kind=%s', async (kind) => {
    const response = await POST(
      presignRequest({
        kind,
        fileName: 'avatar.svg',
        mimeType: 'image/svg+xml',
        byteCount: 2_048,
        projectId: 'proj-1',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it.each(ALL_KINDS)(
    'refuses an SVG that hides its type behind a charset parameter for kind=%s',
    async (kind) => {
      const response = await POST(
        presignRequest({
          kind,
          fileName: 'logo.svg',
          mimeType: 'image/svg+xml; charset=utf-8',
          byteCount: 2_048,
          projectId: 'proj-1',
        }),
      );

      expect(response.status).toBe(400);
      expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
    },
  );

  it.each(ALL_KINDS)(
    'refuses SVG bytes relabelled as application/xml for kind=%s',
    async (kind) => {
      const response = await POST(
        presignRequest({
          kind,
          fileName: 'payload.svg',
          mimeType: 'application/xml',
          byteCount: 2_048,
          projectId: 'proj-1',
        }),
      );

      expect(response.status).toBe(400);
      expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
    },
  );

  it('still signs a PNG avatar', async () => {
    const response = await POST(
      presignRequest({
        kind: 'avatar',
        fileName: 'me.png',
        mimeType: 'image/png',
        byteCount: 120_000,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetPresignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('signs a PDF knowledge file only for the private bucket', async () => {
    const response = await POST(
      presignRequest({
        kind: 'knowledge-file',
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 900_000,
        projectId: 'proj-1',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetPresignedPrivateUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^knowledge-files\/projects\/proj-1\//),
        contentType: 'application/pdf',
      }),
    );
    expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
    expect(mockNeonQuery).toHaveBeenCalledWith(
      expect.stringContaining('organization_id is not distinct from $3::uuid'),
      ['proj-1', 'user-abc', '11111111-1111-4111-8111-111111111111'],
    );
  });

  it('routes a knowledge file through the same-origin proxy off the CORS-safe dev origin', async () => {
    const response = await POST(
      presignRequest(
        {
          kind: 'knowledge-file',
          fileName: 'spec.pdf',
          mimeType: 'application/pdf',
          byteCount: 900_000,
          projectId: 'proj-1',
        },
        'http://localhost:3100',
      ),
    );
    const body = (await response.json()) as {
      uploadUrl: string;
      uploadHeaders: Record<string, string>;
    };

    expect(response.status).toBe(200);
    expect(mockGetPresignedPrivateUploadUrl).not.toHaveBeenCalled();
    expect(body.uploadUrl).toMatch(
      /^http:\/\/localhost:3100\/api\/uploads\/knowledge-file\/put\?key=knowledge-files%2Fprojects%2Fproj-1%2F/,
    );
    expect(body.uploadHeaders).toHaveProperty('x-csrf-token');
  });

  it('signs chat attachments only for the private bucket and returns no public locator', async () => {
    const response = await POST(
      presignRequest({
        kind: 'chat-attachment',
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        byteCount: 128,
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(mockGetPresignedPrivateUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^chat-attachments\/user-abc\//),
        contentType: 'text/plain',
        contentLength: 128,
      }),
    );
    expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty('publicUrl');
  });

  it('does not sign a knowledge upload for a project outside the active workspace', async () => {
    mockNeonQuery.mockResolvedValueOnce([]);

    const response = await POST(
      presignRequest({
        kind: 'knowledge-file',
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 900_000,
        projectId: 'proj-1',
      }),
    );

    expect(response.status).toBe(404);
    expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe('POST /api/uploads/presign · avatar size policy', () => {
  it('refuses an avatar above the avatar cap even though it is under the attachment cap', async () => {
    const response = await POST(
      presignRequest({
        kind: 'avatar',
        fileName: 'huge.png',
        mimeType: 'image/png',
        byteCount: 20 * 1024 * 1024,
      }),
    );

    expect(response.status).toBe(400);
    expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses a non-image avatar', async () => {
    const response = await POST(
      presignRequest({
        kind: 'avatar',
        fileName: 'resume.pdf',
        mimeType: 'application/pdf',
        byteCount: 40_000,
      }),
    );

    expect(response.status).toBe(400);
    expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
  });
});
