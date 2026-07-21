/**
 * Contract tests for /api/connectors/permissions — server-owned per-tool
 * connector permission persistence. The DB adapter is mocked at getNeonDb so
 * the real SQL + the wire<->table vocabulary mapping run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetClerkAuthUser, mockQuery, mockCsrf } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockQuery: vi.fn(),
  mockCsrf: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mockGetClerkAuthUser }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mockQuery }) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));

import { GET, PUT } from '../route';
import { createError } from '@/lib/errors';

function req(body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/connectors/permissions', {
    method: body ? 'PUT' : 'GET',
    ...(body
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}

describe('/api/connectors/permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-owner' });
    mockCsrf.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
  });

  it('GET lists the user’s verdicts, owner-scoped, mapping table→wire vocabulary', async () => {
    mockQuery.mockResolvedValue([
      { connector_id: 'github', tool_name: 'create_issue', level: 'blocked' },
      { connector_id: 'github', tool_name: 'list', level: 'always-allow' },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('from public.connector_tool_permissions');
    expect(sql).toContain('where user_id = $1');
    expect(params[0]).toBe('user-owner');
    const body = (await res.json()) as { permissions: Array<{ toolName: string; level: string }> };
    expect(body.permissions).toEqual([
      { connectorId: 'github', toolName: 'create_issue', level: 'deny' },
      { connectorId: 'github', toolName: 'list', level: 'allow' },
    ]);
  });

  it('PUT upserts owner-scoped with the wire→table vocabulary mapping', async () => {
    const res = await PUT(req({ connectorId: 'github', toolName: 'create_issue', level: 'deny' }));
    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into public.connector_tool_permissions');
    expect(sql).toContain('on conflict (user_id, connector_id, tool_name)');
    // user_id=$1 owner-scoped; level mapped deny -> blocked.
    expect(params[0]).toBe('user-owner');
    expect(params[3]).toBe('blocked');
  });

  it('PUT 400s an invalid level and never touches the DB', async () => {
    const res = await PUT(req({ connectorId: 'github', toolName: 'x', level: 'nonsense' }));
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('GET 401s when unauthenticated and never queries', async () => {
    mockGetClerkAuthUser.mockRejectedValue(createError.unauthorized());
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
