/**
 * Project-level export.
 *
 * Only an account-wide GDPR export existed, which is the wrong granularity for
 * moving one project, archiving finished work, or handing a client their
 * material.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  authUser: vi.fn(async () => ({ userId: 'user-1' })),
  rateLimit: vi.fn(async (): Promise<Response | null> => null),
  resolveActiveOrganizationId: vi.fn(async () => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: () => mocks.authUser() }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: () => mocks.rateLimit() }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: () => mocks.resolveActiveOrganizationId(),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/projects', () => ({
  mapProjectRow: (row: Record<string, unknown>) => ({ id: row['id'], name: row['name'] }),
}));

const { GET } = await import('./route');

const call = () =>
  GET(new NextRequest('https://agiworkforce.com/api/projects/proj-1/export'), {
    params: Promise.resolve({ id: 'proj-1' }),
  });

describe('GET /api/projects/[id]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'user-1' });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.resolveActiveOrganizationId.mockResolvedValue(null);
  });

  it('returns a self-contained snapshot as a download', async () => {
    mocks.query
      .mockResolvedValueOnce([{ id: 'proj-1', name: 'Q3 Analysis' }])
      .mockResolvedValueOnce([
        {
          file_name: 'spec.pdf',
          mime_type: 'application/pdf',
          byte_count: 1024,
          checksum_sha256: 'a'.repeat(64),
          summary: null,
          source_surface: 'web',
          added_at: '2026-08-01T00:00:00.000Z',
          version: 1,
          extracted_text: 'Launch is October 4.',
        },
      ]);

    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('q3-analysis-export.json');
    // An export is a snapshot of live data; a cached copy would leak a stale one.
    expect(res.headers.get('cache-control')).toBe('no-store');

    const body = (await res.json()) as Record<string, unknown>;
    expect(body['version']).toBe(1);
    // Self-contained: a manifest of filenames the recipient cannot read is not
    // an export.
    expect(JSON.stringify(body)).toContain('Launch is October 4.');
  });

  it('is owner-only, unlike GET on the project itself', async () => {
    // GET /projects/[id] also serves org-shared readers. An export is a bulk
    // extraction of every file's text, so sharing must not confer it.
    mocks.query.mockResolvedValueOnce([]);

    const res = await call();
    expect(res.status).toBe(404);
    // No second query: it never reaches the knowledge files.
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('exports the project without files when the table is not migrated', async () => {
    mocks.query
      .mockResolvedValueOnce([{ id: 'proj-1', name: 'Q3' }])
      .mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));

    const res = await call();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { knowledgeFiles?: unknown[] };
    expect(body.knowledgeFiles).toEqual([]);
  });

  it('falls back to a safe filename when the project name has no usable characters', async () => {
    mocks.query.mockResolvedValueOnce([{ id: 'proj-1', name: '***' }]).mockResolvedValueOnce([]);

    const res = await call();
    expect(res.headers.get('content-disposition')).toContain('project-export.json');
  });
});
