import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  listMediaJobHistory: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/server/media-job-history', () => ({
  listMediaJobHistory: mocks.listMediaJobHistory,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const db = { query: vi.fn() };

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/media/jobs');
}

describe('/api/media/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: 'org-1' });
    mocks.withRateLimit.mockResolvedValue(null);
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.listMediaJobHistory).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.listMediaJobHistory).not.toHaveBeenCalled();
  });

  it('lists the caller media jobs in the active workspace without caching', async () => {
    mocks.listMediaJobHistory.mockResolvedValue([{ id: 'job-1', kind: 'image' }]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ jobs: [{ id: 'job-1', kind: 'image' }] });
    expect(mocks.listMediaJobHistory).toHaveBeenCalledWith(db, 'user-1', 'org-1');
  });
});
