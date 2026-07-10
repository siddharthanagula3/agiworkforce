/**
 * Contract tests for GET /api/library — the Library listing route.
 *
 * The database adapter is mocked at the `getNeonDb` seam so the REAL
 * `listLibraryAssets` SQL-building runs; the tests assert the properties the
 * contract promises:
 *   - 401 when unauthenticated (no query is issued).
 *   - Owner scoping: the authed user id is the $1 binding of the query.
 *   - Filters: kind/surface/origin/q reach the SQL; the surface clause uses
 *     the documented legacy coalesce fallback; ILIKE wildcards are escaped.
 *   - Legacy rows (empty metadata) map to surface 'file', mime-derived
 *     previewable, origin 'generated', and a non-empty fallback file_name.
 *   - Pagination: limit+1 probe drives has_more/next_offset.
 *   - 400 for out-of-contract query params.
 *   - Every response parses against LibraryListResponseSchema.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { LibraryListResponseSchema } from '@agiworkforce/services';

const { mockGetClerkAuthUser, mockQuery } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mockGetClerkAuthUser,
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mockQuery }),
}));

import { GET } from '../route';
import { createError } from '@/lib/errors';

const ASSET_ID = '22222222-2222-4222-8222-222222222222';

function makeRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/library${query}`);
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ASSET_ID,
    kind: 'file',
    mime_type: 'application/pdf',
    byte_size: 2048,
    prompt: null,
    provider: 'anthropic',
    model: 'model-x',
    source_surface: 'web',
    metadata: {
      filename: 'report.pdf',
      origin: 'e2b-execution',
      surface: 'file',
      previewable: true,
    },
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

async function parsedBody(res: Response) {
  return LibraryListResponseSchema.parse(await res.json());
}

describe('GET /api/library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-owner' });
    mockQuery.mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated and never queries the database', async () => {
    mockGetClerkAuthUser.mockRejectedValue(createError.unauthorized());
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('scopes the listing to the authenticated user', async () => {
    mockQuery.mockResolvedValue([makeRow()]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where user_id = $1 and deleted_at is null');
    expect(params[0]).toBe('user-owner');
    const body = await parsedBody(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: ASSET_ID,
      file_name: 'report.pdf',
      uri: `/api/files/${ASSET_ID}`,
      surface: 'file',
      previewable: true,
      origin: 'generated',
    });
  });

  it('passes kind and surface filters into the SQL with the legacy coalesce fallback', async () => {
    const res = await GET(makeRequest('?kind=image&surface=artifact'));
    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('and kind = $2');
    expect(sql).toContain("coalesce(metadata->>'surface', 'file') = $3");
    expect(params).toEqual(['user-owner', 'image', 'artifact', 25, 0]);
  });

  it('derives the uploaded/generated origin filter from metadata.origin', async () => {
    await GET(makeRequest('?origin=uploaded'));
    let [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain("metadata->>'origin' in ('upload', 'uploaded')");

    mockQuery.mockClear();
    await GET(makeRequest('?origin=generated'));
    [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain("coalesce(metadata->>'origin', '') not in ('upload', 'uploaded')");
  });

  it('searches filename and prompt with ILIKE and escapes wildcards', async () => {
    await GET(makeRequest(`?q=${encodeURIComponent('100%_report')}`));
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("coalesce(metadata->>'filename', '') ilike $2");
    expect(sql).toContain("coalesce(prompt, '') ilike $2");
    expect(params[1]).toBe('%100\\%\\_report%');
  });

  it('maps legacy rows (empty metadata) to the documented fallbacks', async () => {
    mockQuery.mockResolvedValue([
      makeRow({ kind: 'image', mime_type: 'image/png', metadata: {}, prompt: 'a red fox' }),
    ]);
    const res = await GET(makeRequest());
    const body = await parsedBody(res);
    expect(body.items[0]).toMatchObject({
      file_name: 'image.png',
      surface: 'file',
      previewable: true, // mime-derived for legacy image rows
      origin: 'generated',
      prompt: 'a red fox',
    });
  });

  it('legacy non-image rows without metadata are not previewable', async () => {
    mockQuery.mockResolvedValue([
      makeRow({ mime_type: 'application/zip', metadata: {}, kind: 'file' }),
    ]);
    const body = await parsedBody(await GET(makeRequest()));
    expect(body.items[0]?.previewable).toBe(false);
    expect(body.items[0]?.file_name).toBe('file');
  });

  it('paginates with a limit+1 probe and reports has_more/next_offset', async () => {
    mockQuery.mockResolvedValue([makeRow(), makeRow(), makeRow()]);
    const res = await GET(makeRequest('?limit=2&offset=4'));
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('limit $2 offset $3');
    expect(params).toEqual(['user-owner', 3, 4]); // probe = limit + 1
    const body = await parsedBody(res);
    expect(body.items).toHaveLength(2);
    expect(body.has_more).toBe(true);
    expect(body.next_offset).toBe(6);
  });

  it('reports the honest last page (has_more false, next_offset null)', async () => {
    mockQuery.mockResolvedValue([makeRow()]);
    const body = await parsedBody(await GET(makeRequest('?limit=2')));
    expect(body.items).toHaveLength(1);
    expect(body.has_more).toBe(false);
    expect(body.next_offset).toBeNull();
  });

  it('rejects out-of-contract query params with 400', async () => {
    for (const query of ['?kind=hologram', '?origin=teleported', '?limit=101', '?offset=-1']) {
      const res = await GET(makeRequest(query));
      expect(res.status, query).toBe(400);
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns an empty page when the table has not been migrated yet', async () => {
    mockQuery.mockRejectedValue(Object.assign(new Error('undefined table'), { code: '42P01' }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await parsedBody(res);
    expect(body).toEqual({ items: [], has_more: false, next_offset: null });
  });
});
