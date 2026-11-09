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
import { presentActivity } from '../../activity/activity-presentation';

const unmappedApprovalRow = {
  id: 'audit-approval',
  event_type: 'tool_approval_decided',
  endpoint: '/api/llm/v1/chat/completions/approve',
  user_agent: null,
  created_at: '2026-09-19T12:00:00.000Z',
};

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
    expect(params[0]).toBe(SCOPED_USER);
  });

  it('offers only categories whose rows the activity presenter can show', async () => {
    await GET(new NextRequest('http://localhost/api/settings/audit-logs/actions'));

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/sal\.event_type = any\(\$2::text\[\]\)/);
    expect(params[1]).toContain('login');
    expect(params[1]).not.toContain('tool_approval_decided');
    expect(presentActivity(unmappedApprovalRow)).toBeNull();
  });
});
