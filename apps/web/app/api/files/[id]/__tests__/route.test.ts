import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
type ScanModule0 = typeof import('@/lib/services/tier-unit-quota-service');

const {
  mockGetUserScopedDb,
  mockGetActiveWorkspaceMediaAssetById,
  mockStreamObject,
  mockIsConfigured,
  scopedDb,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockGetActiveWorkspaceMediaAssetById: vi.fn(),
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
  streamStoredMedia: mockStreamObject,
  isMediaStorageConfigured: mockIsConfigured,
  deleteStoredMedia: vi.fn(),
}));

const { mockRecordEgressBytes } = vi.hoisted(() => ({ mockRecordEgressBytes: vi.fn() }));
vi.mock('@/lib/services/infrastructure-cost', () => ({
  recordEgressBytes: mockRecordEgressBytes,
}));

const { mockAssertDownloadAllowance } = vi.hoisted(() => ({
  mockAssertDownloadAllowance: vi.fn(async (_input: unknown) => undefined),
}));
vi.mock('@/lib/services/tier-unit-quota-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  assertDownloadAllowance: mockAssertDownloadAllowance,
}));

import { GET } from '../route';
import { createError } from '@/lib/errors';
import { freeDailyLimitError } from '@/lib/services/tier-unit-quota-service';

const ASSET_ID = '22222222-2222-4222-8222-222222222222';

function makeRequest(id: string, query = '', headers?: Record<string, string>) {
  return new Request(`http://localhost:3000/api/files/${id}${query}`, { headers }) as never;
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) } as never;
}

function streamedFile(
  data: Uint8Array | Buffer,
  contentType: string,
  contentLength = data.byteLength,
) {
  return {
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    }),
    contentType,
    contentLength,
    contentRange: undefined,
  };
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
    expect(mockStreamObject).not.toHaveBeenCalled();
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
    expect(mockStreamObject).not.toHaveBeenCalled();
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
    mockStreamObject.mockResolvedValue(null);
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
  });

  it('serves the exact stored bytes with content-type and inline disposition', async () => {
    const stored = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n%%EOF', 'utf8');
    const storedHash = createHash('sha256').update(stored).digest('hex');
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: stored.byteLength }),
    );
    mockStreamObject.mockResolvedValue(streamedFile(stored, 'application/pdf'));

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="report.pdf"');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    const served = Buffer.from(await res.arrayBuffer());
    const servedHash = createHash('sha256').update(served).digest('hex');
    expect(servedHash).toBe(storedHash);
    expect(mockStreamObject).toHaveBeenCalledWith('media/file/user-owner/x.pdf');
    expect(mockAssertDownloadAllowance).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-owner',
        bytes: stored.byteLength,
      }),
    );
  });

  it('answers 429 with no bytes once the Free daily download cap is used up', async () => {
    const stored = Buffer.from('%PDF-1.7\n%%EOF', 'utf8');
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: stored.byteLength }),
    );
    mockStreamObject.mockResolvedValue(streamedFile(stored, 'application/pdf'));
    mockAssertDownloadAllowance.mockRejectedValueOnce(freeDailyLimitError('egress_bytes'));

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

    expect(res.status).toBe(429);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toMatchObject({
      error: { message: freeDailyLimitError('egress_bytes').message },
    });
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
    mockStreamObject.mockResolvedValue(streamedFile(stored, mimeType));

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
    mockStreamObject.mockResolvedValue(streamedFile(stored, 'image/png'));

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="chart.png"');
  });

  it('allows the authenticated PDF preview to frame only PDF bytes from the same origin', async () => {
    const stored = Buffer.from('%PDF-1.7\n%%EOF', 'utf8');
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: stored.byteLength }),
    );
    mockStreamObject.mockResolvedValue(streamedFile(stored, 'application/pdf'));

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
    expect(mockStreamObject).not.toHaveBeenCalled();
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
    mockStreamObject.mockResolvedValue(streamedFile(stored, 'text/csv'));

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
    expect(mockStreamObject).not.toHaveBeenCalled();
  });

  it('returns 413 without buffering when the stored non-video object exceeds the serve cap', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(makeAsset({ byteSize: null }));
    const streamed = streamedFile(Buffer.from('%PDF-1'), 'application/pdf', 31 * 1024 * 1024);
    const cancel = vi.spyOn(streamed.body, 'cancel');
    mockStreamObject.mockResolvedValue(streamed);
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(413);
    expect(cancel).toHaveBeenCalled();
    expect(mockRecordEgressBytes).not.toHaveBeenCalled();
  });

  it('stops reading a non-video stream that runs past the serve cap', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(makeAsset({ byteSize: null }));
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    mockStreamObject.mockResolvedValue({
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          controller.enqueue(chunk);
        },
      }),
      contentType: 'application/pdf',
      contentLength: 1,
      contentRange: undefined,
    });
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(40);
  });

  it('does not accrue video egress when the stored bytes fail validation', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ kind: 'video', mimeType: 'video/mp4', byteSize: 100 }),
    );
    mockStreamObject.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      contentType: 'video/mp4',
      contentLength: 7,
      contentRange: undefined,
    });
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(500);
    expect(mockRecordEgressBytes).not.toHaveBeenCalled();
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
    expect(mockAssertDownloadAllowance).toHaveBeenCalledWith(expect.objectContaining({ bytes: 4 }));
  });

  it('answers 429 with the upgrade path once a paid plan’s monthly downloads are used up', async () => {
    const { PlanDownloadLimitError } = await import('@/lib/services/tier-unit-quota-service');
    const stored = Buffer.from('%PDF-1.7\n%%EOF', 'utf8');
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: stored.byteLength }),
    );
    mockStreamObject.mockResolvedValue(streamedFile(stored, 'application/pdf'));
    mockAssertDownloadAllowance.mockRejectedValueOnce(
      new PlanDownloadLimitError('Pro includes 2.7 GB of file downloads a month.', '2026-11-01'),
    );

    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({
      error: { message: 'Pro includes 2.7 GB of file downloads a month.' },
    });
  });

  it('checks the Free daily download cap before streaming any video bytes', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ kind: 'video', mimeType: 'video/mp4', byteSize: 100 }),
    );
    mockAssertDownloadAllowance.mockRejectedValueOnce(freeDailyLimitError('egress_bytes'));

    const res = await GET(makeRequest(ASSET_ID, '', { Range: 'bytes=2-5' }), makeContext(ASSET_ID));

    expect(res.status).toBe(429);
    expect(mockStreamObject).not.toHaveBeenCalled();
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
