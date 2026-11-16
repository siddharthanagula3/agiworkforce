import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
type ScanModule0 = typeof import('@/lib/services/tier-unit-quota-service');
type InfrastructureCostModule = typeof import('@/lib/services/infrastructure-cost');
type ObjectStorageModule = typeof import('@/lib/server/object-storage');

const {
  mockGetUserScopedDb,
  mockGetActiveWorkspaceMediaAssetById,
  mockStreamObject,
  mockIsConfigured,
  mockIsPrivateConfigured,
  mockHeadPrivateObject,
  mockPresignDownload,
  scopedDb,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockGetActiveWorkspaceMediaAssetById: vi.fn(),
  mockStreamObject: vi.fn(),
  mockIsConfigured: vi.fn(() => true),
  mockIsPrivateConfigured: vi.fn(() => true),
  mockHeadPrivateObject: vi.fn(),
  mockPresignDownload: vi.fn(),
  scopedDb: { query: vi.fn() },
}));

type MediaStorageModule = typeof import('@/lib/server/media-storage');

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

vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  streamStoredMedia: mockStreamObject,
  isMediaStorageConfigured: mockIsConfigured,
  isSealedPrivateChatAttachmentPathname: (await importOriginal<MediaStorageModule>())
    .isSealedPrivateChatAttachmentPathname,
  deleteStoredMedia: vi.fn(),
}));

vi.mock('@/lib/server/object-storage', async (importOriginal) => ({
  ...(await importOriginal<ObjectStorageModule>()),
  isPrivateObjectStorageConfigured: mockIsPrivateConfigured,
  headPrivateObject: mockHeadPrivateObject,
  getPresignedPrivateDownloadUrl: mockPresignDownload,
}));

const { mockRecordEgressBytes } = vi.hoisted(() => ({ mockRecordEgressBytes: vi.fn() }));
vi.mock('@/lib/services/infrastructure-cost', async (importOriginal) => ({
  ...(await importOriginal<InfrastructureCostModule>()),
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
import { buildAiGeneratedProvenance } from '@/lib/compliance/ai-act';
import { freeDailyLimitError } from '@/lib/services/tier-unit-quota-service';
import {
  LARGE_CHAT_FILES_CAPABILITY,
  MAX_CHAT_ATTACHMENT_BYTES,
} from '@agiworkforce/cloud-contracts';

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
    mockIsPrivateConfigured.mockReturnValue(true);
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
      { organizationId: null },
    );
    expect(mockStreamObject).not.toHaveBeenCalled();
  });

  it('passes the admitted organization to the reader rather than reselecting a workspace', async () => {
    mockGetUserScopedDb.mockResolvedValue({
      db: scopedDb,
      userId: 'user-owner',
      organizationId: 'workspace-A',
    });
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(null);
    const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));
    expect(res.status).toBe(404);
    expect(mockGetActiveWorkspaceMediaAssetById).toHaveBeenCalledWith(
      'user-owner',
      ASSET_ID,
      scopedDb,
      { organizationId: 'workspace-A' },
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

  describe('the owner viewing media they generated (owner decision on media)', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const generatedImage = (overrides: Record<string, unknown> = {}) =>
      makeAsset({
        kind: 'image',
        mimeType: 'image/png',
        byteSize: png.byteLength,
        metadata: {
          filename: 'lighthouse.png',
          aiAct: buildAiGeneratedProvenance({
            kind: 'image',
            provider: 'fixture',
            model: 'fixture-image-model',
          }),
        },
        ...overrides,
      });

    it('serves an image they generated without spending a download allowance, still metered', async () => {
      mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(generatedImage());
      mockStreamObject.mockResolvedValue(streamedFile(png, 'image/png'));

      const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

      expect(res.status).toBe(200);
      expect(mockAssertDownloadAllowance).not.toHaveBeenCalled();
      expect(mockRecordEgressBytes).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-owner',
          bytes: png.byteLength,
          downloadAllowanceExempt: true,
        }),
      );
    });

    it('streams a video they generated without spending a download allowance, still metered', async () => {
      mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
        makeAsset({
          kind: 'video',
          mimeType: 'video/mp4',
          byteSize: 100,
          metadata: {
            filename: 'clip.mp4',
            aiAct: buildAiGeneratedProvenance({
              kind: 'video',
              provider: 'fixture',
              model: 'fixture-video-model',
            }),
          },
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

      const res = await GET(
        makeRequest(ASSET_ID, '', { Range: 'bytes=2-5' }),
        makeContext(ASSET_ID),
      );

      expect(res.status).toBe(206);
      expect(mockAssertDownloadAllowance).not.toHaveBeenCalled();
      expect(mockRecordEgressBytes).toHaveBeenCalledWith(
        expect.objectContaining({ bytes: 4, downloadAllowanceExempt: true }),
      );
    });

    it('keeps the allowance for an image the owner uploaded', async () => {
      mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
        generatedImage({
          metadata: { filename: 'photo.png', origin: 'upload', source: 'chat-attachment' },
        }),
      );
      mockStreamObject.mockResolvedValue(streamedFile(png, 'image/png'));

      const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

      expect(res.status).toBe(200);
      expect(mockAssertDownloadAllowance).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-owner', bytes: png.byteLength }),
      );
      expect(mockRecordEgressBytes).toHaveBeenCalledWith(
        expect.objectContaining({ downloadAllowanceExempt: false }),
      );
    });

    it('keeps the allowance for a generated image recorded under another account', async () => {
      mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
        generatedImage({ userId: 'user-other' }),
      );
      mockStreamObject.mockResolvedValue(streamedFile(png, 'image/png'));

      const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

      expect(res.status).toBe(200);
      expect(mockAssertDownloadAllowance).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-owner' }),
      );
    });

    it('still answers 429 for an uploaded file once the Free daily cap is used up', async () => {
      mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
        generatedImage({ metadata: { filename: 'photo.png', origin: 'upload' } }),
      );
      mockStreamObject.mockResolvedValue(streamedFile(png, 'image/png'));
      mockAssertDownloadAllowance.mockRejectedValueOnce(freeDailyLimitError('egress_bytes'));

      const res = await GET(makeRequest(ASSET_ID), makeContext(ASSET_ID));

      expect(res.status).toBe(429);
    });
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

const MIB = 1024 * 1024;
const SEALED_KEY = 'chat-attachments/user-owner/1731000000000_abc123.pdf.scanned';
const PRESIGNED_URL = 'https://storage.example.com/private/chat-attachments/x?X-Amz-Signature=sig';
const LARGE_COPY = 'This PDF is too large to preview. Download it to open it.';

function largeChatFile(overrides: Record<string, unknown> = {}) {
  return makeAsset({
    byteSize: 400 * MIB,
    storagePathname: SEALED_KEY,
    metadata: { filename: 'report.pdf', origin: 'upload', source: 'chat-attachment' },
    ...overrides,
  });
}

const NAVIGATION = { 'Sec-Fetch-Mode': 'navigate' };
const CAPABILITY = { 'x-agi-client-capabilities': LARGE_CHAT_FILES_CAPABILITY };
const FETCH_FROM_PAGE = { 'Sec-Fetch-Mode': 'cors' };
const NATIVE_REQUEST = { Authorization: 'Bearer test-token' };

function expectNothingSpent() {
  expect(mockPresignDownload).not.toHaveBeenCalled();
  expect(mockAssertDownloadAllowance).not.toHaveBeenCalled();
  expect(mockRecordEgressBytes).not.toHaveBeenCalled();
  expect(mockStreamObject).not.toHaveBeenCalled();
}

describe.each([
  ['unset', undefined],
  ['on', 'on'],
])('sealed large chat files with CHAT_LARGE_FILES_ENABLED %s', (_label, flagValue) => {
  const original = process.env['CHAT_LARGE_FILES_ENABLED'];

  beforeEach(() => {
    vi.clearAllMocks();
    if (flagValue === undefined) delete process.env['CHAT_LARGE_FILES_ENABLED'];
    else process.env['CHAT_LARGE_FILES_ENABLED'] = flagValue;
    mockIsConfigured.mockReturnValue(true);
    mockIsPrivateConfigured.mockReturnValue(true);
    mockGetUserScopedDb.mockResolvedValue({
      db: scopedDb,
      userId: 'user-owner',
      organizationId: null,
    });
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(largeChatFile());
    mockHeadPrivateObject.mockResolvedValue({ contentLength: 400 * MIB });
    mockPresignDownload.mockResolvedValue(PRESIGNED_URL);
  });

  afterEach(() => {
    if (original === undefined) delete process.env['CHAT_LARGE_FILES_ENABLED'];
    else process.env['CHAT_LARGE_FILES_ENABLED'] = original;
  });

  it('a navigation to a sealed chat-attachment asset above the inline limit is redirected', async () => {
    const res = await GET(makeRequest(ASSET_ID, '', NAVIGATION), makeContext(ASSET_ID));

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(PRESIGNED_URL);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(mockPresignDownload).toHaveBeenCalledTimes(1);
    expect(mockPresignDownload).toHaveBeenCalledWith({
      key: SEALED_KEY,
      fileName: 'report.pdf',
      expiresInSeconds: 300,
      contentType: 'application/octet-stream',
    });
    expect(mockStreamObject).not.toHaveBeenCalled();
  });

  it('charges the monthly download allowance and records the egress once per redirect', async () => {
    await GET(makeRequest(ASSET_ID, '', NAVIGATION), makeContext(ASSET_ID));

    expect(mockAssertDownloadAllowance).toHaveBeenCalledTimes(1);
    expect(mockAssertDownloadAllowance).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-owner', bytes: 400 * MIB }),
    );
    expect(mockRecordEgressBytes).toHaveBeenCalledTimes(1);
    expect(mockRecordEgressBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-owner',
        bytes: 400 * MIB,
        provider: 'object_storage',
        downloadAllowanceExempt: false,
      }),
    );
  });

  it('a request carrying large-chat-files-v1 is redirected', async () => {
    const res = await GET(
      makeRequest(ASSET_ID, '', {
        ...FETCH_FROM_PAGE,
        'x-agi-client-capabilities': `other-token, ${LARGE_CHAT_FILES_CAPABILITY}`,
      }),
      makeContext(ASSET_ID),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(PRESIGNED_URL);
  });

  it.each([
    ['a fetch with Sec-Fetch-Mode cors', FETCH_FROM_PAGE],
    ['a native request with no Sec-Fetch-Mode and an Authorization header', NATIVE_REQUEST],
    ['a request with no headers', {}],
    ['a no-cors request', { 'Sec-Fetch-Mode': 'no-cors' }],
    ['a same-origin request', { 'Sec-Fetch-Mode': 'same-origin' }],
    [
      'a capability header that only starts with the token',
      { 'x-agi-client-capabilities': `${LARGE_CHAT_FILES_CAPABILITY}0` },
    ],
    ['an empty capability header', { 'x-agi-client-capabilities': '' }],
    ['a speculative prefetch navigation', { ...NAVIGATION, 'Sec-Purpose': 'prefetch' }],
    ['a speculative prerender navigation', { ...NAVIGATION, 'Sec-Purpose': 'prefetch;prerender' }],
  ])('a request with neither gets 413: %s', async (_name, headers) => {
    const res = await GET(makeRequest(ASSET_ID, '', headers), makeContext(ASSET_ID));

    expect(res.status).toBe(413);
    expect(res.headers.get('location')).toBeNull();
    expectNothingSpent();
  });

  it.each([
    [
      'a 40 MiB generated asset',
      makeAsset({ byteSize: 40 * MIB, metadata: { filename: 'out.pdf', origin: 'e2b-execution' } }),
    ],
    [
      'a public-bucket asset',
      largeChatFile({ storagePathname: 'chat-attachments/user-owner/1731000000000_abc123.pdf' }),
    ],
    [
      'a local-prefix asset',
      largeChatFile({
        storagePathname:
          'local-dev-media/file/0123456789abcdef0123456789abcdef/33333333-3333-4333-8333-333333333333.pdf',
      }),
    ],
    [
      'a sealed key outside the private chat prefix',
      largeChatFile({ storagePathname: 'private-media/file/abc/x.pdf.scanned' }),
    ],
    [
      'a key under the chat prefix that only ends like a sealed key',
      largeChatFile({ storagePathname: 'chat-attachments/x.scanned' }),
    ],
    [
      'a chat-attachment asset recorded under another source',
      largeChatFile({ metadata: { filename: 'report.pdf', source: 'library' } }),
    ],
    ['a sealed chat file recorded under another account', largeChatFile({ userId: 'user-other' })],
    [
      'a sealed chat file typed as video above the video serve cap',
      largeChatFile({
        mimeType: 'video/mp4',
        byteSize: 300 * MIB,
        storagePathname: SEALED_KEY.replace('.pdf', '.mp4'),
        metadata: { filename: 'clip.mp4', origin: 'upload', source: 'chat-attachment' },
      }),
    ],
  ])('keeps 413 for %s, even for a navigation or the token', async (_name, asset) => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(asset);

    for (const headers of [NAVIGATION, CAPABILITY, { ...NAVIGATION, ...CAPABILITY }]) {
      const res = await GET(makeRequest(ASSET_ID, '', headers), makeContext(ASSET_ID));
      expect(res.status).toBe(413);
      expect(res.headers.get('location')).toBeNull();
    }
    expectNothingSpent();
  });

  it('keeps 413 when private object storage is not configured', async () => {
    mockIsPrivateConfigured.mockReturnValue(false);

    const res = await GET(makeRequest(ASSET_ID, '', NAVIGATION), makeContext(ASSET_ID));

    expect(res.status).toBe(413);
    expectNothingSpent();
  });

  it('answers 413 preview_too_large with the copy before reading the request', async () => {
    for (const headers of [NAVIGATION, CAPABILITY, FETCH_FROM_PAGE, {}]) {
      const res = await GET(makeRequest(ASSET_ID, '?preview=pdf', headers), makeContext(ASSET_ID));
      expect(res.status).toBe(413);
      expect(res.headers.get('location')).toBeNull();
      await expect(res.json()).resolves.toEqual({
        error: { code: 'preview_too_large', message: LARGE_COPY },
      });
    }
    expectNothingSpent();
  });

  it('keeps the plain 413 for a preview of an asset that is not a sealed chat file', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: 40 * MIB, metadata: { filename: 'out.pdf', origin: 'e2b-execution' } }),
    );

    const res = await GET(makeRequest(ASSET_ID, '?preview=pdf', NAVIGATION), makeContext(ASSET_ID));

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('answers 404 for a preview of a large chat file that is not a PDF', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      largeChatFile({
        mimeType: 'text/csv',
        storagePathname: `${SEALED_KEY}`.replace('.pdf', '.csv'),
      }),
    );

    const res = await GET(makeRequest(ASSET_ID, '?preview=pdf', NAVIGATION), makeContext(ASSET_ID));

    expect(res.status).toBe(404);
  });

  it.each([
    ['the inline limit', MAX_CHAT_ATTACHMENT_BYTES],
    ['27 MiB', 27 * MIB],
    ['30 MiB', 30 * MIB],
  ])(
    'serves a sealed chat file of %s as today, whatever the request headers',
    async (_name, size) => {
      const stored = Buffer.from('%PDF-1.7\n%%EOF', 'utf8');
      mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(largeChatFile({ byteSize: size }));

      for (const headers of [NAVIGATION, CAPABILITY, FETCH_FROM_PAGE, {}]) {
        mockStreamObject.mockResolvedValueOnce(streamedFile(stored, 'application/pdf'));
        const res = await GET(makeRequest(ASSET_ID, '', headers), makeContext(ASSET_ID));
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
        expect(Buffer.from(await res.arrayBuffer()).equals(stored)).toBe(true);
      }
      expect(mockPresignDownload).not.toHaveBeenCalled();
      expect(mockHeadPrivateObject).not.toHaveBeenCalled();
    },
  );

  it('answers 429 and signs nothing once the monthly downloads are used up', async () => {
    mockAssertDownloadAllowance.mockRejectedValueOnce(freeDailyLimitError('egress_bytes'));

    const res = await GET(makeRequest(ASSET_ID, '', NAVIGATION), makeContext(ASSET_ID));

    expect(res.status).toBe(429);
    expect(mockPresignDownload).not.toHaveBeenCalled();
    expect(mockRecordEgressBytes).not.toHaveBeenCalled();
  });

  it('answers 404 and charges nothing when the sealed object is gone', async () => {
    mockHeadPrivateObject.mockResolvedValue(null);

    const res = await GET(makeRequest(ASSET_ID, '', NAVIGATION), makeContext(ASSET_ID));

    expect(res.status).toBe(404);
    expectNothingSpent();
  });

  it('fails closed and charges nothing when the stored size is not the recorded size', async () => {
    mockHeadPrivateObject.mockResolvedValue({ contentLength: 399 * MIB });

    const res = await GET(makeRequest(ASSET_ID, '', NAVIGATION), makeContext(ASSET_ID));

    expect(res.status).toBe(500);
    expect(res.headers.get('location')).toBeNull();
    expectNothingSpent();
  });

  it('does not record the egress when signing fails', async () => {
    mockPresignDownload.mockRejectedValue(new Error('signing unavailable'));

    const res = await GET(makeRequest(ASSET_ID, '', NAVIGATION), makeContext(ASSET_ID));

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(mockRecordEgressBytes).not.toHaveBeenCalled();
  });

  it('redirects the key that the sealing copy writes', async () => {
    const { sealedChatAttachmentPathname } = await vi.importActual<
      typeof import('@/lib/server/media-storage')
    >('@/lib/server/media-storage');
    const key = sealedChatAttachmentPathname(
      'chat-attachments/user-owner/1731000000000_abc123.pdf',
    );
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(largeChatFile({ storagePathname: key }));

    const res = await GET(makeRequest(ASSET_ID, '', NAVIGATION), makeContext(ASSET_ID));

    expect(res.status).toBe(302);
    expect(mockPresignDownload).toHaveBeenCalledWith(expect.objectContaining({ key }));
  });
});
