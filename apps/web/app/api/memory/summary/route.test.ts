import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type EntitlementModule = typeof import('@/lib/services/entitlement-resolution');
type MemorySummaryModule = typeof import('@/lib/services/memory-summary-service');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(),
  rateLimit: vi.fn(),
  planTier: vi.fn(),
  readCached: vi.fn(),
  generate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: async () => ({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: null,
  }),
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<EntitlementModule>()),
  resolveEntitledPlanTier: mocks.planTier,
}));
vi.mock('@/lib/services/memory-summary-service', async (importOriginal) => ({
  ...(await importOriginal<MemorySummaryModule>()),
  readCachedMemorySummary: mocks.readCached,
  generateMemorySummary: mocks.generate,
}));

const { GET, POST } = await import('./route');

const PATH = '/api/memory/summary';
const MEMORY_ROWS = [
  { id: 'm-1', content: 'Works in Austin', updated_at: '2026-10-18 09:00:00+00' },
  { id: 'm-2', content: 'Prefers short answers', updated_at: '2026-10-17 09:00:00+00' },
];
const SUMMARY = { about: ['Works in Austin'], preferences: ['Prefers short answers'] };

function request(method = 'GET') {
  return new NextRequest(`http://localhost${PATH}`, { method });
}

describe('/api/memory/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.query.mockResolvedValue(MEMORY_ROWS);
    mocks.planTier.mockResolvedValue('plus');
    mocks.readCached.mockResolvedValue(null);
    mocks.generate.mockResolvedValue({ summary: SUMMARY, generatedAt: '2026-10-19T00:00:00.000Z' });
  });

  it('GET answers with the cached summary for the current memories', async () => {
    mocks.readCached.mockResolvedValue({
      summary: SUMMARY,
      generatedAt: '2026-10-18T10:00:00.000Z',
    });
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      summary: SUMMARY,
      memoryCount: 2,
      generatedAt: '2026-10-18T10:00:00.000Z',
    });
    expect(mocks.readCached).toHaveBeenCalledWith('user-1', expect.any(String));
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('GET answers an empty summary without reading the cache when there are no memories', async () => {
    mocks.query.mockResolvedValue([]);
    const response = await GET(request());

    expect(await response.json()).toEqual({
      summary: { about: [], preferences: [] },
      memoryCount: 0,
      generatedAt: null,
    });
    expect(mocks.readCached).not.toHaveBeenCalled();
  });

  it('POST writes a summary of the caller’s memories at their plan tier', async () => {
    const response = await POST(request('POST'));

    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: null,
        planTier: 'plus',
        memories: [
          { id: 'm-1', content: 'Works in Austin', updatedAt: '2026-10-18 09:00:00+00' },
          { id: 'm-2', content: 'Prefers short answers', updatedAt: '2026-10-17 09:00:00+00' },
        ],
      }),
    );
    expect(await response.json()).toEqual({
      summary: SUMMARY,
      memoryCount: 2,
      generatedAt: '2026-10-19T00:00:00.000Z',
    });
  });

  it('POST says the summary could not be written when generation fails', async () => {
    mocks.generate.mockRejectedValue(new Error('provider down'));
    const response = await POST(request('POST'));

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).toContain('could not be written right now');
  });

  it('POST returns the CSRF refusal and generates nothing', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request('POST'));

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
