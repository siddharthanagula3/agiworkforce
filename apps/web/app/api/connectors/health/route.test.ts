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

function failedCall(secondsAgo: number, connectorId = 'gmail') {
  return {
    connector_id: connectorId,
    tool_name: 'search',
    outcome: 'failed',
    duration_ms: 900,
    occurred_at: new Date(Date.now() - secondsAgo * 1000).toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: SCOPED_USER,
    organizationId: null,
  });
  mocks.query.mockResolvedValue([]);
});

describe('GET /api/connectors/health', () => {
  it('reads through the rls scoped handle, constrained to the caller', async () => {
    const request = new NextRequest('http://localhost/api/connectors/health');

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(request, { resolveOrganization: false });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/from public\.connector_call_events/i);
    expect(params[0]).toBe(SCOPED_USER);
  });

  it('reports a connector whose recent calls all failed as not responding, with its backoff', async () => {
    mocks.query.mockResolvedValue([failedCall(1), failedCall(2), failedCall(3)]);

    const body = (await (
      await GET(new NextRequest('http://localhost/api/connectors/health'))
    ).json()) as {
      connectors: Array<Record<string, unknown>>;
    };

    expect(body.connectors).toHaveLength(1);
    expect(body.connectors[0]).toMatchObject({
      connectorId: 'gmail',
      state: 'not-responding',
      circuit: 'open',
      failures: 3,
      meteredCalls: 3,
    });
    expect(body.connectors[0]?.['retryAfterMs']).toBeGreaterThan(0);
  });

  it('narrows to one connector when asked', async () => {
    mocks.query.mockResolvedValue([failedCall(1), failedCall(2, 'slack')]);

    const body = (await (
      await GET(new NextRequest('http://localhost/api/connectors/health?connectorId=slack'))
    ).json()) as { connectors: Array<{ connectorId: string }> };

    expect(body.connectors.map((entry) => entry.connectorId)).toEqual(['slack']);
  });

  it('answers with nothing measured rather than an error while the migration is pending', async () => {
    mocks.query.mockRejectedValue(
      Object.assign(new Error('relation "connector_call_events" does not exist'), {
        code: '42P01',
      }),
    );

    const response = await GET(new NextRequest('http://localhost/api/connectors/health'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connectors: [] });
  });
});
