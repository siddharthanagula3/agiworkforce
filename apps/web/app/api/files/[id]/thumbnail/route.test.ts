import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  LibraryThumbnailPathParamsSchema,
  libraryThumbnailPath,
} from '@agiworkforce/cloud-contracts';

type InfrastructureCostModule = typeof import('@/lib/services/infrastructure-cost');
type RateLimitModule = typeof import('@/lib/rate-limit');
type LoggerModule = typeof import('@/lib/logger');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type MediaAssetsModule = typeof import('@/lib/server/media-assets');
type MediaStorageModule = typeof import('@/lib/server/media-storage');

const {
  mockGetUserScopedDb,
  mockGetActiveWorkspaceMediaAssetById,
  mockStreamStoredMedia,
  mockRecordEgressBytes,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockGetActiveWorkspaceMediaAssetById: vi.fn(),
  mockStreamStoredMedia: vi.fn(),
  mockRecordEgressBytes: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: mockGetUserScopedDb,
}));
vi.mock('@/lib/server/media-assets', async (importOriginal) => ({
  ...(await importOriginal<MediaAssetsModule>()),
  getActiveWorkspaceMediaAssetById: mockGetActiveWorkspaceMediaAssetById,
}));
vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...(await importOriginal<MediaStorageModule>()),
  isMediaStorageConfigured: () => true,
  streamStoredMedia: mockStreamStoredMedia,
}));
vi.mock('@/lib/services/infrastructure-cost', async (importOriginal) => ({
  ...(await importOriginal<InfrastructureCostModule>()),
  recordEgressBytes: mockRecordEgressBytes,
}));

const { GET } = await import('./route');

const ASSET_ID = '22222222-2222-4222-8222-222222222222';

function makeRequest(id = ASSET_ID) {
  return new Request(`http://localhost:3000${libraryThumbnailPath(id)}`) as never;
}

function makeContext(id = ASSET_ID) {
  return { params: Promise.resolve({ id }) } as never;
}

function streamed(data: Buffer) {
  return {
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    }),
    contentType: 'image/png',
    contentLength: data.byteLength,
    contentRange: undefined,
  };
}

async function largePicture(): Promise<Buffer> {
  return sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 40, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
}

function makeAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    userId: 'user-owner',
    organizationId: null,
    kind: 'image',
    mimeType: 'image/png',
    byteSize: 1024,
    storageUrl: 'https://media.example.com/media/image/user-owner/x.png',
    storagePathname: 'media/image/user-owner/x.png',
    metadata: { filename: 'chart.png', origin: 'uploaded' },
    deletedAt: null,
    ...overrides,
  };
}

describe('GET /api/files/[id]/thumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: vi.fn() },
      userId: 'user-owner',
      organizationId: null,
    });
  });

  it('serves a small picture of an uploaded image without spending the download allowance', async () => {
    const source = await largePicture();
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: source.byteLength }),
    );
    mockStreamStoredMedia.mockResolvedValue(streamed(source));

    const res = await GET(makeRequest(), makeContext());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(body).metadata();
    expect(metadata.format).toBe('webp');
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThan(2400);
    expect(body.byteLength).toBeLessThan(source.byteLength);
    expect(mockRecordEgressBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-owner',
        bytes: body.byteLength,
        downloadAllowanceExempt: true,
      }),
    );
  });

  it('refuses a file that is not a picture, so the route cannot serve any file free', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ kind: 'file', mimeType: 'application/pdf' }),
    );

    const res = await GET(makeRequest(), makeContext());

    expect(res.status).toBe(404);
    expect(mockStreamStoredMedia).not.toHaveBeenCalled();
    expect(mockRecordEgressBytes).not.toHaveBeenCalled();
  });

  it('answers not found for a file outside the workspace or in Recently deleted', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValueOnce(null);
    expect((await GET(makeRequest(), makeContext())).status).toBe(404);

    mockGetActiveWorkspaceMediaAssetById.mockResolvedValueOnce(
      makeAsset({ deletedAt: '2026-11-01T00:00:00.000Z' }),
    );
    expect((await GET(makeRequest(), makeContext())).status).toBe(404);
    expect(mockStreamStoredMedia).not.toHaveBeenCalled();
  });

  it('answers not found when the stored bytes are not a readable picture', async () => {
    const garbage = Buffer.from('not a picture at all');
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ byteSize: garbage.byteLength }),
    );
    mockStreamStoredMedia.mockResolvedValue(streamed(garbage));

    const res = await GET(makeRequest(), makeContext());

    expect(res.status).toBe(404);
    expect(mockRecordEgressBytes).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a uuid before reading anything', async () => {
    const res = await GET(makeRequest('not-a-uuid'), makeContext('not-a-uuid'));

    expect(res.status).toBe(404);
    expect(mockGetActiveWorkspaceMediaAssetById).not.toHaveBeenCalled();
  });

  it('reads the id the shared path contract accepts, in any letter case', async () => {
    const upperCaseId = ASSET_ID.toUpperCase();
    expect(LibraryThumbnailPathParamsSchema.safeParse({ id: upperCaseId }).success).toBe(true);
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(null);

    const res = await GET(makeRequest(upperCaseId), makeContext(upperCaseId));

    expect(res.status).toBe(404);
    expect(mockGetActiveWorkspaceMediaAssetById).toHaveBeenCalledWith(
      'user-owner',
      upperCaseId,
      expect.anything(),
      { organizationId: null },
    );
  });

  it('answers a refusal with the JSON error body, not picture bytes', async () => {
    mockGetActiveWorkspaceMediaAssetById.mockResolvedValue(
      makeAsset({ kind: 'file', mimeType: 'application/pdf' }),
    );

    const res = await GET(makeRequest(), makeContext());

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
      }),
    );
  });
});
