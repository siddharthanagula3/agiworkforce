import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  readDeveloperUsage: vi.fn(),
  developerUsageMonth: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/developer-usage-service', () => ({
  readDeveloperUsage: mocks.readDeveloperUsage,
  developerUsageMonth: mocks.developerUsageMonth,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const db = { query: vi.fn() };
const month = { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' };

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/developers/usage');
}

describe('/api/developers/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.developerUsageMonth.mockReturnValue(month);
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.readDeveloperUsage).not.toHaveBeenCalled();
  });

  it('returns the rate limit response before resolving the caller', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('reads this month usage for the caller and never caches it', async () => {
    mocks.readDeveloperUsage.mockResolvedValue({ total: { credits: 12 }, projects: [] });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ total: { credits: 12 }, projects: [] });
    expect(mocks.readDeveloperUsage).toHaveBeenCalledWith(db, 'user-1', month);
  });
});
