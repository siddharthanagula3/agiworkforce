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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: SCOPED_USER,
    organizationId: null,
  });
  mocks.query.mockResolvedValue([]);
});

describe('GET /api/connectors/calls', () => {
  it('reads the log through the rls scoped handle, constrained to the caller', async () => {
    const request = new NextRequest('http://localhost/api/connectors/calls');

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(request, { resolveOrganization: false });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/from public\.connector_call_events/i);
    expect(sql).toMatch(/where user_id = \$1/i);
    expect(params[0]).toBe(SCOPED_USER);
  });

  it('narrows to one connector when asked, and to none when not', async () => {
    await GET(new NextRequest('http://localhost/api/connectors/calls?connectorId=gmail'));
    expect((mocks.query.mock.calls[0] as [string, unknown[]])[1][1]).toBe('gmail');

    mocks.query.mockClear();
    await GET(new NextRequest('http://localhost/api/connectors/calls'));
    expect((mocks.query.mock.calls[0] as [string, unknown[]])[1][1]).toBeNull();
  });

  it('answers with an empty log rather than an error while the migration is pending', async () => {
    mocks.query.mockRejectedValue(
      Object.assign(new Error('relation "connector_call_events" does not exist'), {
        code: '42P01',
      }),
    );

    const response = await GET(new NextRequest('http://localhost/api/connectors/calls'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ calls: [] });
  });

  it('returns the shape the panel renders', async () => {
    mocks.query.mockResolvedValue([
      {
        connector_id: 'gmail',
        tool_name: 'send',
        outcome: 'failed',
        duration_ms: 412,
        occurred_at: '2026-09-17T12:00:00.000Z',
      },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/connectors/calls'));

    expect(await response.json()).toEqual({
      calls: [
        {
          connectorId: 'gmail',
          toolName: 'send',
          outcome: 'failed',
          durationMs: 412,
          occurredAt: '2026-09-17T12:00:00.000Z',
        },
      ],
    });
  });
});
