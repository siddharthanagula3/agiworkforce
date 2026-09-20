import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  store: {
    uploadPart: vi.fn(),
    listUploadedParts: vi.fn(),
    completeMultipartUpload: vi.fn(),
    abortMultipartUpload: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
  upsertVideoMediaAsset: vi.fn(),
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
vi.mock('@/lib/server/media-assets', () => ({
  upsertVideoMediaAsset: (...args: unknown[]) => mocks.upsertVideoMediaAsset(...(args as [])),
}));
vi.mock('@/lib/server/media-storage', () => ({
  authenticatedMediaUrl: (id: string) => `/api/files/${id}`,
  deleteStoredMedia: vi.fn(),
  videoStoragePathname: () => 'videos/a.mp4',
}));
vi.mock('../resumable-upload', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    resumableUploadTarget: () => ({ store: mocks.store, bucket: 'private', key: 'videos/a.mp4' }),
  };
});

import { POST, PUT } from './route';

const ASSET_ID = '3f1c0c9e-7b6a-4a2e-8f1d-2b9c6a5e4d31';
const MIME = 'video/mp4';
const MP4 = Uint8Array.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);
const MZ = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const context = { params: Promise.resolve({ uploadId: 'upload-1' }) };

function partRequest(partNumber: number, body: Uint8Array): NextRequest {
  const url = `http://localhost/api/files/uploads/upload-1?assetId=${ASSET_ID}&mimeType=${MIME}&partNumber=${partNumber}`;
  return new NextRequest(url, { method: 'PUT', body: body as BodyInit }) as never;
}

function completeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/files/uploads/upload-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetId: ASSET_ID, mimeType: MIME, fileName: 'clip.mp4' }),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.uploadPart.mockImplementation(async ({ partNumber }: { partNumber: number }) => ({
    partNumber,
    etag: `etag-${partNumber}`,
    sizeBytes: 8,
  }));
  mocks.store.listUploadedParts.mockResolvedValue([
    { partNumber: 1, etag: 'etag-1', sizeBytes: 8 },
    { partNumber: 2, etag: 'etag-2', sizeBytes: 8 },
  ]);
  mocks.store.completeMultipartUpload.mockResolvedValue(undefined);
  mocks.store.get.mockResolvedValue({ data: MP4 });
  mocks.store.delete.mockResolvedValue(undefined);
  mocks.upsertVideoMediaAsset.mockResolvedValue(ASSET_ID);
});

describe('PUT a part', () => {
  it('accepts a three-part upload whose continuations carry no signature', async () => {
    const parts = [MP4, Uint8Array.from([0x11, 0x22, 0x33, 0x44]), MZ];

    for (const [index, body] of parts.entries()) {
      const response = await PUT(partRequest(index + 1, body), context);
      expect(response.status, `part ${index + 1} was refused`).toBe(200);
    }

    expect(mocks.store.uploadPart).toHaveBeenCalledTimes(3);
  });

  it('sends a stored part to the configured malware scanner', async () => {
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', 'https://scanner.example.test/scan');
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ safe: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await PUT(partRequest(1, MP4), context);

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('scanner.example.test');
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('refuses a first part that is an executable wearing the video type', async () => {
    const response = await PUT(partRequest(1, MZ), context);

    expect(response.status).toBe(400);
    expect(mocks.store.uploadPart).not.toHaveBeenCalled();
  });
});

describe('POST to complete', () => {
  it('inspects the object the parts assembled into, then records the asset', async () => {
    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(200);
    expect(mocks.store.get).toHaveBeenCalledWith('private', 'videos/a.mp4');
    expect(mocks.store.get.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.store.completeMultipartUpload.mock.invocationCallOrder[0]!,
    );
    expect(mocks.upsertVideoMediaAsset).toHaveBeenCalled();
    expect(mocks.store.delete).not.toHaveBeenCalled();
  });

  it('purges the completed object and records nothing when the assembled bytes are refused', async () => {
    mocks.store.get.mockResolvedValue({ data: MZ });

    const response = await POST(completeRequest(), context);

    expect(response.status).toBe(400);
    expect(mocks.store.delete).toHaveBeenCalledWith('private', 'videos/a.mp4');
    expect(mocks.upsertVideoMediaAsset).not.toHaveBeenCalled();
  });
});
