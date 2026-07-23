/**
 * Tests for GET /api/files/[id] — the authenticated same-origin byte-serving
 * route for generated files.
 *
 * Covers:
 *   - 401 when unauthenticated.
 *   - 403 when the asset belongs to a different user (owner scoping).
 *   - 404 for unknown ids, non-UUID ids, soft-deleted assets, and missing bytes.
 *   - 200 serves the exact stored bytes (sha256 in == sha256 out) with the
 *     asset's Content-Type, an inline Content-Disposition carrying the original
 *     filename, and private cache headers — the properties the PDF/image
 *     renderer gates depend on.
 *   - 413 when the asset exceeds the serve cap.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const { mockGetClerkAuthUser, mockGetMediaAssetById, mockGetObject, mockIsConfigured } = vi.hoisted(
  () => ({
    mockGetClerkAuthUser: vi.fn(),
    mockGetMediaAssetById: vi.fn(),
    mockGetObject: vi.fn(),
    mockIsConfigured: vi.fn(() => true),
  }),
);

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
}));

vi.mock('@/lib/server/media-assets', () => ({
  getMediaAssetById: mockGetMediaAssetById,
}));

vi.mock('@/lib/server/object-storage', () => ({
  getObject: mockGetObject,
  isObjectStorageConfigured: mockIsConfigured,
}));

import { GET } from '../route';
import { createError } from '@/lib/errors';

const ASSET_ID = '22222222-2222-4222-8222-222222222222';

function makeRequest(id: string, query = '') {
  return new Request(`http://localhost:3000/api/files/${id}${query}`) as never;
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) } as never;
}

function makeAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    userId: 'user-owner',
    kind: 'file',
    mimeType: 'application/pdf',
    byteSize: 6,
    storageUrl: 'https://media.example.com/media/file/user-owner/x.pdf',
    storagePathname: 'media/file/user-owner/x.pdf',
    metadata: { filename: 'report.pdf', origin: 'e2b-execution' },
    deletedAt: null,
    ...overrides,
  };
}

describe('GET /api/files/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured.mockReturnValue(true);
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-owner' });
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetClerkAuthUser.mockRejectedValue(createError.unauthorized());
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(401);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it("returns 403 for another user's asset and never touches storage", async () => {
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-intruder' });
    mockGetMediaAssetById.mockResolvedValue(makeAsset());
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(403);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown asset id', async () => {
    mockGetMediaAssetById.mockResolvedValue(null);
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-UUID id without hitting the database', async () => {
    const res = await GET(makeRequest('../etc/passwd'), makeContext('../etc/passwd'));
    expect(res.status).toBe(404);
    expect(mockGetMediaAssetById).not.toHaveBeenCalled();
  });

  it('returns 404 for a soft-deleted asset', async () => {
    mockGetMediaAssetById.mockResolvedValue(makeAsset({ deletedAt: '2026-07-01T00:00:00Z' }));
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
  });

  it('returns 404 when the stored object is gone', async () => {
    mockGetMediaAssetById.mockResolvedValue(makeAsset());
    mockGetObject.mockResolvedValue(null);
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
  });

  it('serves the exact stored bytes with content-type and inline disposition', async () => {
    // %PDF header + trailing bytes — enough to prove byte-for-byte integrity.
    const stored = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n%%EOF', 'utf8');
    const storedHash = createHash('sha256').update(stored).digest('hex');
    mockGetMediaAssetById.mockResolvedValue(makeAsset({ byteSize: stored.byteLength }));
    mockGetObject.mockResolvedValue({ data: stored, contentType: 'application/pdf' });

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="report.pdf"');
    expect(res.headers.get('cache-control')).toContain('private');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    const served = Buffer.from(await res.arrayBuffer());
    const servedHash = createHash('sha256').update(served).digest('hex');
    expect(servedHash).toBe(storedHash);
    expect(mockGetObject).toHaveBeenCalledWith('media/file/user-owner/x.pdf');
  });

  it('allows the authenticated PDF preview to frame only PDF bytes from the same origin', async () => {
    const stored = Buffer.from('%PDF-1.7\n%%EOF', 'utf8');
    mockGetMediaAssetById.mockResolvedValue(makeAsset({ byteSize: stored.byteLength }));
    mockGetObject.mockResolvedValue({ data: stored, contentType: 'application/pdf' });

    const res = await GET(makeRequest(ASSET_ID, '?preview=pdf'), makeContext(ASSET_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('rejects the PDF frame exception for generated HTML without reading its bytes', async () => {
    mockGetMediaAssetById.mockResolvedValue(
      makeAsset({
        mimeType: 'text/html',
        storagePathname: 'media/file/user-owner/dashboard.html',
      }),
    );

    const res = await GET(makeRequest(ASSET_ID, '?preview=pdf'), makeContext(ASSET_ID));

    expect(res.status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('sanitizes hostile filenames in Content-Disposition', async () => {
    const stored = Buffer.from('a,b\n1,2\n', 'utf8');
    mockGetMediaAssetById.mockResolvedValue(
      makeAsset({
        mimeType: 'text/csv',
        byteSize: stored.byteLength,
        metadata: { filename: 'evil"\r\nSet-Cookie: x=1;.csv' },
      }),
    );
    mockGetObject.mockResolvedValue({ data: stored, contentType: 'text/csv' });

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(200);
    const disposition = res.headers.get('content-disposition') ?? '';
    // No header injection: single well-formed quoted filename, no CR/LF/quotes inside.
    expect(disposition).toMatch(/^inline; filename="[^"\r\n]*"$/);
    expect(res.headers.get('content-type')).toBe('text/csv');
  });

  it('returns 413 when the recorded size exceeds the serve cap', async () => {
    mockGetMediaAssetById.mockResolvedValue(makeAsset({ byteSize: 31 * 1024 * 1024 }));
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(413);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('returns 404 when object storage is not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    mockGetMediaAssetById.mockResolvedValue(makeAsset());
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
  });
});
