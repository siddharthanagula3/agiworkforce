import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { LibraryListResponseSchema } from '@agiworkforce/cloud-contracts';

const { mockGetUserScopedDb, mockQuery, mockResolveActiveOrganizationId } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
  mockResolveActiveOrganizationId: vi.fn(),
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

vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mockResolveActiveOrganizationId,
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
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockQuery },
      userId: 'user-owner',
      organizationId: null,
    });
    mockResolveActiveOrganizationId.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated and never queries the database', async () => {
    mockGetUserScopedDb.mockRejectedValue(createError.unauthorized());
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('scopes Personal listing to the authenticated user and null organization', async () => {
    mockQuery.mockResolvedValue([makeRow()]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('where user_id = $1');
    expect(sql).toContain('organization_id is not distinct from $2::uuid');
    expect(sql).toContain('deleted_at is null');
    expect(params.slice(0, 2)).toEqual(['user-owner', null]);
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

  it('scopes organization listing to the server-resolved active membership', async () => {
    const organizationId = '33333333-3333-4333-8333-333333333333';
    mockResolveActiveOrganizationId.mockResolvedValue(organizationId);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('organization_id is not distinct from $2::uuid');
    expect(params.slice(0, 2)).toEqual(['user-owner', organizationId]);
  });

  it('lists the recently-deleted bin (30-day window) when deleted=true', async () => {
    const res = await GET(makeRequest('?deleted=true'));
    expect(res.status).toBe(200);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("deleted_at is not null and deleted_at > now() - interval '30 days'");
    expect(sql).not.toContain('deleted_at is null');
    expect(sql).toContain('order by deleted_at desc');
  });

  it('passes kind and surface filters into the SQL with the legacy coalesce fallback', async () => {
    const res = await GET(makeRequest('?kind=image&surface=artifact'));
    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('and kind = any($3::text[])');
    expect(sql).toContain("coalesce(metadata->>'surface', 'file') = $4");
    expect(params).toEqual(['user-owner', null, ['image'], 'artifact', 25, 0]);
  });

  // The Images tab shows videos beside stills, so one request has to carry both
  // kinds. A per-kind request would page them independently and interleave wrong.
  it('accepts several kinds in one request so a tab can span them', async () => {
    const res = await GET(makeRequest('?kind=image,video'));
    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('and kind = any($3::text[])');
    expect(params[2]).toEqual(['image', 'video']);
  });

  it('rejects a kind the catalog does not define rather than ignoring it', async () => {
    const res = await GET(makeRequest('?kind=image,binary'));
    expect(res.status).toBe(400);
  });

  it('orders by the requested sort and defaults to most recently modified', async () => {
    await GET(makeRequest(''));
    expect((mockQuery.mock.calls[0] as [string])[0]).toContain('order by created_at desc');

    mockQuery.mockClear();
    await GET(makeRequest('?sort=name'));
    expect((mockQuery.mock.calls[0] as [string])[0]).toContain(
      "order by coalesce(metadata->>'filename', kind) asc",
    );

    mockQuery.mockClear();
    await GET(makeRequest('?sort=size'));
    expect((mockQuery.mock.calls[0] as [string])[0]).toContain(
      'order by byte_size desc nulls last',
    );
  });

  it('keeps the deleted bin on its own ordering, whatever sort is asked for', async () => {
    await GET(makeRequest('?deleted=true&sort=size'));
    expect((mockQuery.mock.calls[0] as [string])[0]).toContain('order by deleted_at desc');
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
    expect(sql).toContain("coalesce(metadata->>'filename', '') ilike $3");
    expect(sql).toContain("coalesce(prompt, '') ilike $3");
    expect(params[2]).toBe('%100\\%\\_report%');
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
    expect(sql).toContain('limit $3 offset $4');
    expect(params).toEqual(['user-owner', null, 3, 4]);
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
