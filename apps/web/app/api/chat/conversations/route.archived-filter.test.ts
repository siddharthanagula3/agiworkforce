import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: vi.fn(async () => null),
  resolveOrganizationMembershipId: vi.fn(),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));

const { GET } = await import('./route');

describe('GET /api/chat/conversations archived filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
  });

  it('can return only archived conversations for the account manager', async () => {
    const response = await GET(
      new NextRequest(
        'https://agiworkforce.com/api/chat/conversations?archived=only&limit=50&offset=0',
      ),
    );

    expect(response.status).toBe(200);
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('archived = true');
    expect(params).toEqual(['user-1', null, 51, 0]);
  });

  it('preserves the existing inclusive list contract by default', async () => {
    await GET(new NextRequest('https://agiworkforce.com/api/chat/conversations'));

    const [sql] = mocks.query.mock.calls[0]!;
    expect(sql).not.toContain('archived = true');
    expect(sql).not.toContain('archived = false');
  });
});
