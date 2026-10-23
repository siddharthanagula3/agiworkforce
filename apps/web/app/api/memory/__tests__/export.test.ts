import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { parseImportedMemoryText } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  rateLimit: vi.fn(async (): Promise<Response | null> => null),
  organizationId: null as string | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: mocks.organizationId,
  })),
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cors')>()),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from '../export/route';

function row(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `018f6f2a-0000-7000-8000-${String(index).padStart(12, '0')}`,
    content: `Fact ${index}`,
    category: 'preference',
    source: 'web',
    pinned: false,
    project_id: null,
    project_name: null,
    expires_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

function request() {
  return new NextRequest('https://example.test/api/memory/export');
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.rateLimit.mockReset();
  mocks.rateLimit.mockResolvedValue(null);
  mocks.organizationId = null;
});

describe('GET /api/memory/export', () => {
  it('returns every active memory as a downloadable JSON file', async () => {
    mocks.query.mockResolvedValueOnce([
      row(1, { pinned: true, project_id: 'p-1', project_name: 'Launch' }),
      row(2),
    ]);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="memories-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = (await response.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      id: row(1).id,
      content: 'Fact 1',
      category: 'preference',
      source: 'web',
      pinned: true,
      projectId: 'p-1',
      projectName: 'Launch',
      expiresAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });
  });

  it('reads only the caller, only active memories and only the current workspace', async () => {
    mocks.organizationId = '11111111-1111-4111-8111-111111111111';
    mocks.query.mockResolvedValueOnce([]);

    await GET(request());

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('m.user_id = $1');
    expect(sql).toContain('m.is_deleted = false');
    expect(sql).toContain('m.superseded_by is null');
    expect(sql).toContain('m.organization_id is not distinct from $2::uuid');
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('pages through large memory sets by id instead of stopping at one page', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => row(index + 1));
    mocks.query.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([row(1001)]);

    const response = await GET(request());

    expect(mocks.query).toHaveBeenCalledTimes(2);
    const secondParams = mocks.query.mock.calls[1]?.[1] as unknown[];
    expect(secondParams[2]).toBe(firstPage.at(-1)?.id);
    expect((await response.json()) as unknown[]).toHaveLength(1001);
  });

  it('produces a file the memory import reads back fact for fact', async () => {
    mocks.query.mockResolvedValueOnce([row(1), row(2)]);

    const response = await GET(request());
    const parsed = parseImportedMemoryText(await response.text());

    expect(parsed.format).toBe('json');
    expect(parsed.items).toEqual(['Fact 1', 'Fact 2']);
  });

  it('answers the rate limit without reading memories', async () => {
    mocks.rateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
