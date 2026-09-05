import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getUserScopedDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({ handleCorsPreflightRequest: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...args),
}));

import { GET } from './route';

const SCOPED_USER = 'user-1';

function scopedHandle() {
  return {
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: SCOPED_USER,
    organizationId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue(scopedHandle());
  mocks.query.mockResolvedValue([]);
});

describe('GET /api/settings/audit-logs/actions', () => {
  it('reads the distinct event types through the rls scoped handle', async () => {
    const request = new NextRequest('http://localhost/api/settings/audit-logs/actions');

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(request, { resolveOrganization: false });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/from public\.security_audit_logs/i);
    expect(params).toEqual([SCOPED_USER]);
  });
});
