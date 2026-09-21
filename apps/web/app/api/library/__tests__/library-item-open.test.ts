import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { LibraryListResponseSchema } from '@agiworkforce/cloud-contracts';

const { mockGetUserScopedDb, mockQuery, mockResolveActiveOrganizationId, assetStore, storage } =
  vi.hoisted(() => ({
    mockGetUserScopedDb: vi.fn(),
    mockQuery: vi.fn(),
    mockResolveActiveOrganizationId: vi.fn(),
    assetStore: { rows: [] as Array<Record<string, unknown>> },
    storage: { objects: new Map<string, Uint8Array>() },
  }));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  withRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getUserScopedDb: mockGetUserScopedDb,
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  resolveActiveOrganizationId: mockResolveActiveOrganizationId,
  resolveOrganizationMembershipId: vi.fn(async () => null),
}));

/**
 * The listing keeps the real query builder; only the single-asset read the file
 * route performs is stood in for, with the scoping its own suite proves:
 * owner, active workspace, and not deleted.
 */
vi.mock('@/lib/server/media-assets', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getActiveWorkspaceMediaAssetById: vi.fn(async (userId: string, id: string) => {
      const row = assetStore.rows.find(
        (candidate) =>
          candidate['id'] === id &&
          candidate['user_id'] === userId &&
          candidate['organization_id'] == null &&
          candidate['deleted_at'] == null,
      );
      if (!row) return null;
      return {
        id: String(row['id']),
        userId: String(row['user_id']),
        kind: String(row['kind']),
        mimeType: String(row['mime_type']),
        byteSize: Number(row['byte_size']),
        storageUrl: `https://media.example.test/${String(row['storage_pathname'])}`,
        storagePathname: String(row['storage_pathname']),
        metadata: row['metadata'] as Record<string, unknown>,
        deletedAt: null,
      };
    }),
  };
});

vi.mock('@/lib/server/media-storage', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  isMediaStorageConfigured: () => true,
  readStoredMedia: async (pathname: string) => {
    const data = storage.objects.get(pathname);
    return data ? { data, contentType: 'application/octet-stream' } : null;
  },
  streamStoredMedia: vi.fn(),
  deleteStoredMedia: vi.fn(),
}));

import { GET as listLibrary } from '../route';
import { GET as getFile } from '../../files/[id]/route';

const OWNER = 'user-owner';
const STRANGER = 'user-stranger';
const UPLOADED_ID = '11111111-1111-4111-8111-111111111111';
const GENERATED_ID = '22222222-2222-4222-8222-222222222222';
const UPLOADED_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: UPLOADED_ID,
    user_id: OWNER,
    organization_id: null,
    kind: 'file',
    mime_type: 'application/pdf',
    byte_size: UPLOADED_BYTES.byteLength,
    prompt: null,
    provider: 'upload',
    model: '',
    source_surface: 'web',
    storage_pathname: 'media/file/user-owner/quarterly-report.pdf',
    metadata: {
      filename: 'quarterly-report.pdf',
      origin: 'upload',
      surface: 'file',
      previewable: false,
    },
    created_at: '2026-09-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function generatedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeRow({
    id: GENERATED_ID,
    kind: 'image',
    mime_type: 'image/png',
    provider: 'openai',
    model: 'image-model',
    prompt: 'a lighthouse at dusk',
    storage_pathname: 'media/image/user-owner/lighthouse.png',
    metadata: { filename: 'lighthouse.png', surface: 'file', previewable: true },
    ...overrides,
  });
}

async function listing(query = ''): Promise<ReturnType<typeof LibraryListResponseSchema.parse>> {
  const response = await listLibrary(new NextRequest(`http://localhost:3000/api/library${query}`));
  expect(response.status).toBe(200);
  return LibraryListResponseSchema.parse(await response.json());
}

function openFromLibrary(uri: string): Promise<Response> {
  const id = uri.slice(uri.lastIndexOf('/') + 1);
  return getFile(
    new Request(`http://localhost:3000${uri}`) as never,
    {
      params: Promise.resolve({ id }),
    } as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  assetStore.rows = [makeRow(), generatedRow()];
  storage.objects = new Map([['media/file/user-owner/quarterly-report.pdf', UPLOADED_BYTES]]);
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery },
    userId: OWNER,
    organizationId: null,
  });
  mockResolveActiveOrganizationId.mockResolvedValue(null);
  mockQuery.mockImplementation(async () => assetStore.rows);
});

describe('opening what the Library lists', () => {
  it('lists an uploaded file and a generated asset under the origin each came from', async () => {
    const body = await listing();

    const uploaded = body.items.find((item) => item.id === UPLOADED_ID);
    const generated = body.items.find((item) => item.id === GENERATED_ID);

    expect(uploaded).toMatchObject({
      origin: 'uploaded',
      file_name: 'quarterly-report.pdf',
      mime_type: 'application/pdf',
    });
    expect(generated).toMatchObject({
      origin: 'generated',
      file_name: 'lighthouse.png',
      prompt: 'a lighthouse at dusk',
    });
  });

  it('hands out a uri the file route serves, with the name the Library showed', async () => {
    const [uploaded] = (await listing()).items.filter((item) => item.id === UPLOADED_ID);

    const opened = await openFromLibrary(uploaded!.uri);

    expect(opened.status).toBe(200);
    expect(Buffer.from(await opened.arrayBuffer())).toEqual(Buffer.from(UPLOADED_BYTES));
    expect(opened.headers.get('content-type')).toContain('application/pdf');
    expect(opened.headers.get('content-disposition')).toContain('quarterly-report.pdf');
  });

  it('refuses the same uri to an account the asset does not belong to', async () => {
    const [uploaded] = (await listing()).items.filter((item) => item.id === UPLOADED_ID);
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockQuery },
      userId: STRANGER,
      organizationId: null,
    });

    const opened = await openFromLibrary(uploaded!.uri);

    expect(opened.status).toBe(404);
  });

  it('stops serving the uri once the asset is deleted', async () => {
    const [uploaded] = (await listing()).items.filter((item) => item.id === UPLOADED_ID);
    assetStore.rows = assetStore.rows.map((row) =>
      row['id'] === UPLOADED_ID ? { ...row, deleted_at: '2026-09-10T00:00:00.000Z' } : row,
    );

    const opened = await openFromLibrary(uploaded!.uri);

    expect(opened.status).toBe(404);
  });

  it('searches the stored filename and the prompt with the same parameter', async () => {
    await listing('?q=lighthouse');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("metadata->>'filename'");
    expect(sql).toContain("coalesce(prompt, '') ilike");
    expect(params).toContain('%lighthouse%');
  });

  it('asks for the deleted bin rather than the live shelf when the bin is open', async () => {
    await listing('?deleted=true');

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('deleted_at is not null');
    expect(sql).not.toContain('deleted_at is null');
  });
});
