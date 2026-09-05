import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const {
  mockGetUserScopedDb,
  mockGetActiveWorkspaceMediaAssetById,
  mockGetObject,
  mockStreamObject,
  mockIsConfigured,
  scopedDb,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockGetActiveWorkspaceMediaAssetById: vi.fn(),
  mockGetObject: vi.fn(),
  mockStreamObject: vi.fn(),
  mockIsConfigured: vi.fn(() => true),
  scopedDb: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: mockGetUserScopedDb,
}));

vi.mock('@/lib/server/media-assets', () => ({
  getActiveWorkspaceMediaAssetById: mockGetActiveWorkspaceMediaAssetById,
}));

vi.mock('@/lib/server/media-storage', () => ({
  readStoredMedia: mockGetObject,
  streamStoredMedia: mockStreamObject,
  isMediaStorageConfigured: mockIsConfigured,
  deleteStoredMedia: vi.fn(),
}));

import { GET } from '../route';
import { createError } from '@/lib/errors';

const ASSET_ID = '22222222-2222-4222-8222-222222222222';

function makeRequest(id: string, query = '', headers?: Record<string, string>) {
  return new Request(`http://localhost:3000/api/files/${id}${query}`, { headers }) as never;
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
    mockGetUserScopedDb.mockResolvedValue({
      db: scopedDb,
      userId: 'user-owner',
      organizationId: null,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUserScopedDb.mockRejectedValue(createError.unauthorized());
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(401);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('returns the same 404 for an asset outside the active workspace and never touches storage', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(null);
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
    expect(mockGetActiveWorkspaceMediaAssetById).toHaveBeenCalledWith(
      'user-owner',
      ASSET_ID,
      scopedDb,
    );
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown asset id', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(null);
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-UUID id without hitting the database', async () => {
    const res = await GET(makeRequest('../etc/passwd'), makeContext('../etc/passwd'));
    expect(res.status).toBe(404);
    expect(mockGetActiveWorkspaceMediaAssetById).not.toHaveBeenCalled();
  });

  it('returns 404 for a soft-deleted asset', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ deletedAt: '2026-07-01T00:00:00Z' }),
    );
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
  });

  it('returns 404 when the stored object is gone', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(makeAsset());
    mockGetObject.mockResolvedValue(null);
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
  });

  it('serves the exact stored bytes with content-type and inline disposition', async () => {
    const stored = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n%%EOF', 'utf8');
    const storedHash = createHash('sha256').update(stored).digest('hex');
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: stored.byteLength }),
    );
    mockGetObject.mockResolvedValue({ data: stored, contentType: 'application/pdf' });

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="report.pdf"');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    const served = Buffer.from(await res.arrayBuffer());
    const servedHash = createHash('sha256').update(served).digest('hex');
    expect(servedHash).toBe(storedHash);
    expect(mockGetObject).toHaveBeenCalledWith('media/file/user-owner/x.pdf');
  });

  it.each([
    ['text/html', 'dashboard.html'],
    ['image/svg+xml', 'chart.svg'],
    ['application/xhtml+xml', 'page.xhtml'],
    ['text/xml', 'data.xml'],
  ])('serves %s as an opaque download, never as a document', async (mimeType, filename) => {
    const stored = Buffer.from('<svg onload="alert(document.cookie)"></svg>', 'utf8');
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ mimeType, byteSize: stored.byteLength, metadata: { filename } }),
    );
    mockGetObject.mockResolvedValue({ data: stored, contentType: mimeType });

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${filename}"`);
    expect(Buffer.from(await res.arrayBuffer()).equals(stored)).toBe(true);
  });

  it('leaves inert types inline so images and the PDF viewer keep working', async () => {
    const stored = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({
        mimeType: 'image/png',
        byteSize: stored.byteLength,
        metadata: { filename: 'chart.png' },
      }),
    );
    mockGetObject.mockResolvedValue({ data: stored, contentType: 'image/png' });

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="chart.png"');
  });

  it('allows the authenticated PDF preview to frame only PDF bytes from the same origin', async () => {
    const stored = Buffer.from('%PDF-1.7\n%%EOF', 'utf8');
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: stored.byteLength }),
    );
    mockGetObject.mockResolvedValue({ data: stored, contentType: 'application/pdf' });

    const res = await GET(makeRequest(ASSET_ID, '?preview=pdf'), makeContext(ASSET_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('rejects the PDF frame exception for generated HTML without reading its bytes', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
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
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
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
    expect(disposition).toMatch(/^inline; filename="[^"\r\n]*"$/);
    expect(res.headers.get('content-type')).toBe('text/csv');
  });

  it('returns 413 when the recorded size exceeds the serve cap', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: 31 * 1024 * 1024 }),
    );
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(413);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('streams large video assets and advertises byte ranges without buffering', async () => {
    const stored = Uint8Array.from([0, 0, 0, 1, 0x66, 0x74, 0x79, 0x70]);
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({
        kind: 'video',
        mimeType: 'video/mp4',
        byteSize: 80 * 1024 * 1024,
        metadata: { filename: 'video.mp4' },
      }),
    );
    mockStreamObject.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(stored);
          controller.close();
        },
      }),
      contentType: 'video/mp4',
      contentLength: 80 * 1024 * 1024,
      contentRange: undefined,
    });

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(mockGetObject).not.toHaveBeenCalled();
    expect(mockStreamObject).toHaveBeenCalledWith('media/file/user-owner/x.pdf', undefined);
  });

  it('serves a validated single video byte range as 206', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({
        kind: 'video',
        mimeType: 'video/mp4',
        byteSize: 100,
        metadata: { filename: 'video.mp4' },
      }),
    );
    mockStreamObject.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([2, 3, 4, 5]));
          controller.close();
        },
      }),
      contentType: 'video/mp4',
      contentLength: 4,
      contentRange: 'bytes 2-5/100',
    });

    const res = await GET(makeRequest(ASSET_ID, '', { Range: 'bytes=2-5' }), makeContext(ASSET_ID));

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-5/100');
    expect(res.headers.get('content-length')).toBe('4');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(mockStreamObject).toHaveBeenCalledWith('media/file/user-owner/x.pdf', {
      start: 2,
      end: 5,
    });
  });

  it('rejects malformed or multi-range video requests without touching storage', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ kind: 'video', mimeType: 'video/mp4', byteSize: 100 }),
    );

    const res = await GET(
      makeRequest(ASSET_ID, '', { Range: 'bytes=0-1,5-6' }),
      makeContext(ASSET_ID),
    );

    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */100');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(mockStreamObject).not.toHaveBeenCalled();
  });

  it('fails closed when storage returns bytes outside the authenticated range', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ kind: 'video', mimeType: 'video/mp4', byteSize: 100 }),
    );
    mockStreamObject.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([0, 1, 2, 3, 4]));
          controller.close();
        },
      }),
      contentType: 'video/mp4',
      contentLength: 5,
      contentRange: 'bytes 2-6/100',
    });

    const res = await GET(makeRequest(ASSET_ID, '', { Range: 'bytes=2-5' }), makeContext(ASSET_ID));

    expect(res.status).toBe(500);
    expect(res.headers.get('content-range')).toBeNull();
  });

  it('returns 404 when media storage is not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(makeAsset());
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
  });
});
