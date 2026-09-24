import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUserScopedDb, mockDbQuery } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockDbQuery: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getUserScopedDb: mockGetUserScopedDb,
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  withRateLimitHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute: (handler: (...args: unknown[]) => unknown) => handler,
}));

import { GET } from '../route';
import { ApiKeyScopeError } from '@/lib/api-key-scope-error';

const USER = 'user_2abcDEF';

function makeRequest(query = ''): never {
  return new Request(`http://localhost:3000/api/usage/history${query}`, {
    method: 'GET',
  }) as never;
}

function daily(day: string, requests: number, costCents: number) {
  return { day, requests, cost_cents: String(costCents) };
}

describe('GET /api/usage/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({ db: { query: mockDbQuery }, userId: USER });
    mockDbQuery.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/date_trunc\('day'/.test(text)) return [daily('2026-08-22T00:00:00.000Z', 5, 90)];
      if (/unsettled_requests/.test(text)) {
        return [{ latest_activity_at: '2026-08-22T09:00:00.000Z', unsettled_requests: 2 }];
      }
      if (/'workload' as key/.test(text)) {
        return [
          {
            key: 'work',
            requests: 4,
            input_tokens: '900',
            output_tokens: '300',
            cost_cents: '80',
          },
        ];
      }
      if (/group by 1/.test(text)) return [];
      return [
        { key: null, requests: 5, input_tokens: '1000', output_tokens: '400', cost_cents: '90' },
      ];
    });
  });

  it('serves the reader their own settled spend, day by day and by product area', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.userId).toBe(USER);
    expect(body.totals).toEqual({
      requests: 5,
      inputTokens: 1000,
      outputTokens: 400,
      costCents: 90,
    });
    expect(body.daily).toEqual([{ day: '2026-08-22T00:00:00.000Z', requests: 5, costCents: 90 }]);
    expect(body.byWorkload[0]).toMatchObject({ key: 'work', requests: 4, costCents: 80 });
    expect(body.freshness.unsettledRequests).toBe(2);
  });

  it('reads on the caller scoped connection under the usage read scope', async () => {
    await GET(makeRequest());
    expect(mockGetUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      apiKeyScope: 'usage:read',
    });
    for (const [, params] of mockDbQuery.mock.calls) {
      expect((params as unknown[])[0]).toBe(USER);
    }
  });

  it('clamps a window wider than the retained range instead of scanning everything', async () => {
    await GET(makeRequest('?from=1999-01-01T00:00:00.000Z'));
    const [, params] = mockDbQuery.mock.calls[0] as [string, unknown[]];
    const from = new Date(String(params[1])).getTime();
    const to = new Date(String(params[2])).getTime();
    expect(to - from).toBeLessThanOrEqual(367 * 24 * 60 * 60 * 1000);
  });

  it('refuses an unauthenticated reader', async () => {
    mockGetUserScopedDb.mockRejectedValue(new Error('no session'));
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain('no session');
  });

  it('lets an api key scope refusal through rather than reporting it as a sign-in problem', async () => {
    mockGetUserScopedDb.mockRejectedValue(new ApiKeyScopeError('usage:read'));
    const response = await GET(makeRequest());
    expect(response.status).not.toBe(401);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('never returns a database message to the reader', async () => {
    mockDbQuery.mockRejectedValue(
      new Error('relation "public.managed_usage_requests" does not exist'),
    );
    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('managed_usage_requests');
    expect(body).not.toContain('relation');
  });
});
