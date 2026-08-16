import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUserScopedDb, mockQuery, mockExecute, mockCsrf } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockCsrf: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));

import { GET, PUT, DELETE } from '../route';
import { createError } from '@/lib/errors';

function req(body?: unknown, search = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/permissions${search}`, {
    method: body ? 'PUT' : 'GET',
    ...(body
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}

function deleteReq(search: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/permissions${search}`, {
    method: 'DELETE',
  });
}

describe('/api/connectors/permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockQuery, execute: mockExecute },
      userId: 'user-owner',
    });
    mockCsrf.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockExecute.mockResolvedValue(1);
  });

  it('GET lists the user’s verdicts through the RLS-scoped adapter, mapping table→wire', async () => {
    mockQuery.mockResolvedValue([
      { connector_id: 'github', tool_name: 'create_issue', level: 'blocked' },
      { connector_id: 'github', tool_name: 'list', level: 'always-allow' },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockGetUserScopedDb).toHaveBeenCalledTimes(1);
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
    expect(params[0]).toBe('user-owner');
    expect(params[3]).toBe('blocked');
  });

  it('PUT derives `destructive` server-side and ignores the client value (CON-9)', async () => {
    const res = await PUT(
      req({
        connectorId: 'github',
        toolName: 'post_issue_comment',
        level: 'allow',
        destructive: false,
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { destructive: boolean }).toMatchObject({ destructive: true });
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[4]).toBe(true);

    mockQuery.mockClear();
    await PUT(
      req({
        connectorId: 'github',
        toolName: 'get_pull_request_diff',
        level: 'allow',
        destructive: true,
      }),
    );
    const [, readParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(readParams[4]).toBe(false);
  });

  it('PUT 400s an invalid level and never touches the DB', async () => {
    const res = await PUT(req({ connectorId: 'github', toolName: 'x', level: 'nonsense' }));
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('DELETE revokes one tool verdict, owner-scoped (CON-5)', async () => {
    const res = await DELETE(deleteReq('?connectorId=github&toolName=post_issue_comment'));
    expect(res.status).toBe(200);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('delete from public.connector_tool_permissions');
    expect(sql).toContain('tool_name = $3');
    expect(params).toEqual(['user-owner', 'github', 'post_issue_comment']);
  });

  it('DELETE without toolName revokes every verdict for the connector (CON-5)', async () => {
    const res = await DELETE(deleteReq('?connectorId=github'));
    expect(res.status).toBe(200);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('tool_name');
    expect(params).toEqual(['user-owner', 'github']);
  });

  it('DELETE 400s without a connectorId and never touches the DB', async () => {
    const res = await DELETE(deleteReq(''));
    expect(res.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('GET 401s when unauthenticated and never queries', async () => {
    mockGetUserScopedDb.mockRejectedValue(createError.unauthorized());
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
