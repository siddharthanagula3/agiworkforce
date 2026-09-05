import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getUserScopedDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...args),
}));

import { GET } from './route';

const SCOPED_USER = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: SCOPED_USER,
    organizationId: null,
  });
  mocks.query.mockResolvedValue([]);
});

function request() {
  return new NextRequest('http://localhost/api/download-beta?platform=mac');
}

describe('GET /api/download-beta', () => {
  it('reads the entitlement through the rls scoped handle, not the schema owner pool', async () => {
    mocks.query.mockResolvedValueOnce([{ status: 'active' }]);
    vi.stubEnv('NEXT_PUBLIC_DOWNLOAD_URL_MAC', 'https://downloads.agiworkforce.com/mac.dmg');

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('from subscriptions'), [
      SCOPED_USER,
    ]);
    vi.unstubAllEnvs();
  });

  it('refuses a caller with no active subscription', async () => {
    mocks.query.mockResolvedValueOnce([{ status: 'canceled' }]);

    const response = await GET(request());

    expect(response.status).toBe(403);
  });
});
