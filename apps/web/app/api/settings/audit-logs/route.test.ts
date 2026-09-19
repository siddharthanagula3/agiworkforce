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

describe('GET /api/settings/audit-logs?limit=100&offset=0', () => {
  it('reads the audit entries through the rls scoped handle', async () => {
    const request = new NextRequest('http://localhost/api/settings/audit-logs?limit=100&offset=0');

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(request, { resolveOrganization: false });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/from public\.security_audit_logs sal/i);
    expect(params[0]).toBe(SCOPED_USER);
    expect(params[1]).toBe(101);
  });

  it('joins the profile of the requester only, never an arbitrary user', async () => {
    await GET(new NextRequest('http://localhost/api/settings/audit-logs?limit=100&offset=0'));

    const [sql] = mocks.query.mock.calls[0] as [string];
    expect(sql).toMatch(/where sal\.user_id = \$1/i);
  });

  it('returns human activity without internal identifiers, paths, or addresses', async () => {
    mocks.query.mockResolvedValue([
      {
        id: 'audit-1',
        user_id: SCOPED_USER,
        event_type: 'data_accessed',
        severity: 'info',
        ip_address: '203.0.113.4',
        user_agent: 'Mozilla/5.0 (Macintosh) Chrome/120',
        endpoint: '/api/settings/organization/audit',
        details: {
          resource_type: 'organization_usage',
          resource_id: '21663aa7-18c2-43f9-8508-f30c667f5f04',
        },
        created_at: '2026-09-19T12:00:00.000Z',
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/settings/audit-logs?limit=100&offset=0'),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body).toMatchObject({
      entries: [
        {
          id: 'audit-1',
          action: 'data_accessed',
          sentence: 'Viewed account data',
          device: 'Chrome on Mac',
        },
      ],
      hasMore: false,
    });
    expect(serialized).not.toContain('organization_usage');
    expect(serialized).not.toContain('21663aa7');
    expect(serialized).not.toContain('/api/');
    expect(serialized).not.toContain('203.0.113.4');
  });

  it('keeps pagination available when the presenter drops an internal row', async () => {
    mocks.query.mockResolvedValue([
      {
        id: 'audit-1',
        user_id: SCOPED_USER,
        event_type: 'unknown_internal_event',
        severity: 'info',
        ip_address: null,
        user_agent: null,
        endpoint: '/api/internal/unmapped',
        details: null,
        created_at: '2026-09-19T12:00:00.000Z',
      },
      {
        id: 'audit-2',
        user_id: SCOPED_USER,
        event_type: 'login',
        severity: 'info',
        ip_address: null,
        user_agent: null,
        endpoint: null,
        details: null,
        created_at: '2026-09-19T11:00:00.000Z',
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/settings/audit-logs?limit=1&offset=0'),
    );

    await expect(response.json()).resolves.toMatchObject({ entries: [], hasMore: true });
  });
});
