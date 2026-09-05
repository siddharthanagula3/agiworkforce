import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetUserScopedDb, mockQuery, mockAudit } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
  mockAudit: vi.fn(async () => {}),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockAudit,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

import { GET, PUT } from './route';

function req(method: 'GET' | 'PUT' = 'GET', body?: unknown) {
  return new Request('http://localhost:3000/api/billing/overage', {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('GET /api/billing/overage', () => {
  it('reads the overage state through the rls-scoped connection', async () => {
    mockQuery.mockResolvedValue([{ overage_enabled: true, available_cents: 500 }]);

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1']);
    expect(await response.json()).toEqual({ enabled: true, available_cents: 500 });
  });
});

describe('PUT /api/billing/overage', () => {
  it('updates the caller subscription through the rls-scoped connection', async () => {
    mockQuery
      .mockResolvedValueOnce([{ overage_enabled: false, available_cents: 0 }])
      .mockResolvedValueOnce([{ overage_enabled: false, available_cents: 0 }]);

    const response = await PUT(req('PUT', { enabled: false }));

    expect(response.status).toBe(200);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1', false]);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'plan_changed' }),
    );
  });

  it('refuses to enable overage without an active plan', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const response = await PUT(req('PUT', { enabled: true }));

    expect(response.status).toBe(400);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
