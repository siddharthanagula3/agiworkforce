/**
 * Upload type/size policy at the presign boundary.
 *
 * The presigned PUT stamps the object with the caller's declared Content-Type
 * and the R2 bucket is public, so anything this route signs for is
 * world-readable under that type the moment the browser's PUT lands. The
 * per-kind policy is therefore the last enforceable gate, and it has to hold
 * for `avatar` and `knowledge-file`, not only `chat-attachment`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetClerkAuthUser, mockNeonQuery, mockGetPresignedUploadUrl } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockGetPresignedUploadUrl: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
  getAuthenticatedUserWithClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));
vi.mock('@/lib/server/object-storage', () => ({
  isObjectStorageConfigured: vi.fn(() => true),
  getPresignedUploadUrl: mockGetPresignedUploadUrl,
  deleteObject: vi.fn(),
}));

import { POST } from '@/app/api/uploads/presign/route';

type PresignBody = {
  kind: 'avatar' | 'knowledge-file' | 'chat-attachment';
  fileName: string;
  mimeType: string;
  byteCount: number;
  projectId?: string;
};

function presignRequest(body: PresignBody): NextRequest {
  return new NextRequest('http://localhost/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ALL_KINDS = ['avatar', 'knowledge-file', 'chat-attachment'] as const;

beforeEach(() => {
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  // Project ownership lookup for the knowledge-file kind.
  mockNeonQuery.mockResolvedValue([{ id: 'proj-1' }]);
  mockGetPresignedUploadUrl.mockResolvedValue({
    uploadUrl: 'https://r2.test/signed',
    publicUrl: 'https://cdn.test/object',
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

  it('still signs a PDF knowledge file', async () => {
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
    expect(mockGetPresignedUploadUrl).toHaveBeenCalledTimes(1);
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
