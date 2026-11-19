import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { connectorCategoryToolName } from '@agiworkforce/cloud-contracts';

const { mockGetUserScopedDb, mockQuery, mockExecute, mockCsrf, mockTransaction } = vi.hoisted(
  () => ({
    mockGetUserScopedDb: vi.fn(),
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockCsrf: vi.fn(),
    mockTransaction: vi.fn(),
  }),
);

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { GET, PUT, DELETE } from '../route';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';

type SecurityAuditModule = typeof import('@/lib/security-audit');

const mockGeneration = vi.fn(async (_sql: string, _params: unknown[]) => [{ generation: '1' }]);
const routedQuery = (sql: string, params: unknown[]) =>
  sql.includes('connector_permission_generations')
    ? mockGeneration(sql, params)
    : mockQuery(sql, params);

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

function modeledRevocationTransaction(
  options: {
    unsaved?: boolean;
    deleteFailure?: boolean;
    deferredCommit?: boolean;
    persistBeforeCommitError?: boolean;
  } = {},
) {
  const grants = [
    { id: 'personal', user: 'user-owner', org: null, connector: 'github', tool: 'list' },
    { id: 'workspace-a', user: 'user-owner', org: 'org-a', connector: 'github', tool: 'list' },
    { id: 'workspace-b', user: 'user-owner', org: 'org-b', connector: 'github', tool: 'list' },
    { id: 'other-user', user: 'other-user', org: 'org-a', connector: 'github', tool: 'list' },
    { id: 'other-connector', user: 'user-owner', org: 'org-b', connector: 'slack', tool: 'list' },
    {
      id: 'other-tool',
      user: 'user-owner',
      org: 'org-b',
      connector: 'github',
      tool: 'create_issue',
    },
  ];
  let committed = {
    grants,
    standing: [{ user: 'user-owner', connector: 'github', tool: 'list', level: 'always-allow' }],
  };
  const snapshot = () => ({
    grants: committed.grants.map((grant) => ({ ...grant })),
    standing: committed.standing.map((permission) => ({ ...permission })),
  });
  let reachCommit!: () => void;
  const atCommit = new Promise<void>((resolve) => {
    reachCommit = resolve;
  });
  let releaseCommit!: () => void;
  let rejectCommit!: (error: Error) => void;
  const commitGate = options.deferredCommit
    ? new Promise<void>((resolve, reject) => {
        releaseCommit = resolve;
        rejectCommit = reject;
      })
    : Promise.resolve();
  const outside = vi.fn(async () => {
    throw new Error('Mutation escaped transaction');
  });
  const nested = vi.fn(async () => {
    throw new Error('Nested transaction');
  });
  const transactionQuery = vi.fn();
  const transactionExecute = vi.fn();
  const generationsAdvanced: string[] = [];
  const transaction = vi.fn(async (operation: (tx: DatabaseAdapter) => Promise<unknown>) => {
    const pending = snapshot();
    transactionQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('insert into public.connector_permission_generations')) {
        generationsAdvanced.push(params[1] as string);
        return [{ generation: String(generationsAdvanced.length) }];
      }
      if (sql === 'select public.revoke_connector_tool_session_grants($1, $2) as removed') {
        const before = pending.grants.length;
        pending.grants = pending.grants.filter(
          (grant) =>
            !(
              grant.user === 'user-owner' &&
              grant.connector === params[0] &&
              (params[1] === null || grant.tool === params[1])
            ),
        );
        return [{ removed: before - pending.grants.length }];
      }
      if (sql.includes('insert into public.connector_tool_permissions')) {
        if (options.unsaved) return [];
        const [user, connector, names, level] = params as [string, string, string[], string];
        for (const tool of names) {
          pending.standing = pending.standing.filter(
            (row) => !(row.user === user && row.connector === connector && row.tool === tool),
          );
          pending.standing.push({ user, connector, tool, level });
        }
        return names.map((tool_name) => ({ tool_name }));
      }
      throw new Error('Unexpected modeled query');
    });
    transactionExecute.mockImplementation(async (sql: string, params: unknown[]) => {
      if (!sql.includes('delete from public.connector_tool_permissions'))
        throw new Error('Unexpected modeled execute');
      if (options.deleteFailure) throw new Error('Standing delete failed');
      const before = pending.standing.length;
      pending.standing = pending.standing.filter(
        (row) =>
          !(
            row.user === params[0] &&
            row.connector === params[1] &&
            (params.length === 2 || row.tool === params[2])
          ),
      );
      return before - pending.standing.length;
    });
    const result = await operation({
      query: transactionQuery,
      execute: transactionExecute,
      transaction: nested,
    } as unknown as DatabaseAdapter);
    reachCommit();
    try {
      await commitGate;
    } catch (error) {
      if (options.persistBeforeCommitError) committed = pending;
      throw error;
    }
    committed = pending;
    return result;
  });
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: outside, execute: outside, transaction },
    userId: 'user-owner',
    organizationId: 'org-a',
  });
  return {
    snapshot,
    transaction,
    transactionQuery,
    transactionExecute,
    outside,
    nested,
    atCommit,
    releaseCommit,
    rejectCommit,
  };
}

describe('modeled connector revocation transaction boundaries, not SQL or RLS execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCsrf.mockResolvedValue(null);
  });

  it('PUT models revocation across personal/A/B scopes while preserving unrelated grants', async () => {
    const fixture = modeledRevocationTransaction();
    const response = await PUT(req({ connectorId: 'github', toolName: 'list', level: 'ask' }));
    expect(response.status).toBe(200);
    expect(fixture.snapshot().grants.map((grant) => grant.id)).toEqual([
      'other-user',
      'other-connector',
      'other-tool',
    ]);
    expect(fixture.snapshot().standing).toEqual([
      { user: 'user-owner', connector: 'github', tool: 'list', level: 'needs-approval' },
    ]);
    expect(fixture.outside).not.toHaveBeenCalled();
    expect(fixture.nested).not.toHaveBeenCalled();
    expect(fixture.transaction).toHaveBeenCalledOnce();
  });

  it.each(['category', 'connector'] as const)(
    'models %s-wide revocation without crossing principal or connector',
    async (kind) => {
      const fixture = modeledRevocationTransaction();
      const response =
        kind === 'category'
          ? await PUT(req({ connectorId: 'github', category: 'read_only', level: 'ask' }))
          : await DELETE(deleteReq('?connectorId=github'));
      expect(response.status).toBe(200);
      expect(fixture.snapshot().grants.map((grant) => grant.id)).toEqual([
        'other-user',
        'other-connector',
      ]);
      expect(fixture.transactionQuery).toHaveBeenCalledWith(
        'select public.revoke_connector_tool_session_grants($1, $2) as removed',
        ['github', null],
      );
      if (kind === 'category')
        expect(fixture.snapshot().standing).toContainEqual({
          user: 'user-owner',
          connector: 'github',
          tool: connectorCategoryToolName('read_only'),
          level: 'needs-approval',
        });
      expect(fixture.outside).not.toHaveBeenCalled();
    },
  );

  it.each(['unsaved', 'deleteFailure'] as const)(
    'preserves committed grants and settings on %s',
    async (failure) => {
      const fixture = modeledRevocationTransaction({ [failure]: true });
      const before = fixture.snapshot();
      const response =
        failure === 'unsaved'
          ? await PUT(req({ connectorId: 'github', toolName: 'list', level: 'ask' }))
          : await DELETE(deleteReq('?connectorId=github'));
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(fixture.transactionQuery).toHaveBeenCalledWith(
        'select public.revoke_connector_tool_session_grants($1, $2) as removed',
        ['github', failure === 'unsaved' ? 'list' : null],
      );
      expect(fixture.snapshot()).toEqual(before);
      expect(recordAuditEvent).not.toHaveBeenCalled();
      expect(fixture.outside).not.toHaveBeenCalled();
      expect(fixture.transaction).toHaveBeenCalledOnce();
    },
  );

  it.each(['PUT', 'DELETE'] as const)(
    'waits for %s commit before auditing or responding',
    async (method) => {
      const fixture = modeledRevocationTransaction({ deferredCommit: true });
      const before = fixture.snapshot();
      let settled = false;
      const response = (
        method === 'PUT'
          ? PUT(req({ connectorId: 'github', toolName: 'list', level: 'ask' }))
          : DELETE(deleteReq('?connectorId=github'))
      ).then((result) => {
        settled = true;
        return result;
      });
      await fixture.atCommit;
      expect(settled).toBe(false);
      expect(recordAuditEvent).not.toHaveBeenCalled();
      expect(fixture.snapshot()).toEqual(before);
      fixture.releaseCommit();
      expect((await response).status).toBe(200);
      expect(recordAuditEvent).toHaveBeenCalledOnce();
      expect(fixture.snapshot()).not.toEqual(before);
      expect(fixture.outside).not.toHaveBeenCalled();
    },
  );

  it.each(['PUT', 'DELETE'] as const)(
    'does not audit or retry a definitely rolled-back %s commit',
    async (method) => {
      const fixture = modeledRevocationTransaction({ deferredCommit: true });
      const before = fixture.snapshot();
      const response =
        method === 'PUT'
          ? PUT(req({ connectorId: 'github', toolName: 'list', level: 'ask' }))
          : DELETE(deleteReq('?connectorId=github'));
      await fixture.atCommit;
      fixture.rejectCommit(new Error('Commit failed'));
      expect((await response).status).toBeGreaterThanOrEqual(500);
      expect(fixture.snapshot()).toEqual(before);
      expect(recordAuditEvent).not.toHaveBeenCalled();
      expect(fixture.transaction).toHaveBeenCalledOnce();
      expect(fixture.transactionQuery).toHaveBeenCalledTimes(method === 'PUT' ? 3 : 2);
      expect(fixture.transactionExecute).toHaveBeenCalledTimes(method === 'DELETE' ? 1 : 0);
      expect(fixture.outside).not.toHaveBeenCalled();
    },
  );

  it.each(['PUT', 'DELETE'] as const)(
    'does not audit or retry an ambiguous %s commit that persisted',
    async (method) => {
      const fixture = modeledRevocationTransaction({
        deferredCommit: true,
        persistBeforeCommitError: true,
      });
      const before = fixture.snapshot();
      const response =
        method === 'PUT'
          ? PUT(req({ connectorId: 'github', toolName: 'list', level: 'ask' }))
          : DELETE(deleteReq('?connectorId=github'));
      await fixture.atCommit;
      expect(fixture.snapshot()).toEqual(before);
      expect(recordAuditEvent).not.toHaveBeenCalled();
      fixture.rejectCommit(new Error('Commit acknowledgement lost'));
      expect((await response).status).toBeGreaterThanOrEqual(500);
      expect(fixture.snapshot()).not.toEqual(before);
      expect(fixture.snapshot().grants.map((grant) => grant.id)).toEqual(
        method === 'PUT'
          ? ['other-user', 'other-connector', 'other-tool']
          : ['other-user', 'other-connector'],
      );
      expect(recordAuditEvent).not.toHaveBeenCalled();
      expect(fixture.transaction).toHaveBeenCalledOnce();
      expect(fixture.transactionQuery).toHaveBeenCalledTimes(method === 'PUT' ? 3 : 2);
      expect(fixture.transactionExecute).toHaveBeenCalledTimes(method === 'DELETE' ? 1 : 0);
      expect(fixture.outside).not.toHaveBeenCalled();
    },
  );
});

describe('/api/connectors/permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: routedQuery, execute: mockExecute, transaction: mockTransaction },
      userId: 'user-owner',
      organizationId: 'org-active',
    });
    mockCsrf.mockResolvedValue(null);
    mockTransaction.mockImplementation(
      async (operation: (tx: DatabaseAdapter) => Promise<unknown>) =>
        operation({ query: routedQuery, execute: mockExecute } as unknown as DatabaseAdapter),
    );
    mockQuery.mockImplementation(async (sql: string, params: unknown[]) =>
      sql.includes('insert into public.connector_tool_permissions')
        ? (params[2] as string[]).map((tool_name) => ({ tool_name }))
        : sql.includes('revoke_connector_tool_session_grants')
          ? [{ removed: 0 }]
          : [],
    );
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
    const [sql, params] = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('connector_tool_permissions'),
    ) as [string, unknown[]];
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
    const [sql, params] = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('connector_tool_permissions'),
    ) as [string, unknown[]];
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
        level: 'ask',
        destructive: false,
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { destructive: boolean }).toMatchObject({ destructive: true });
    const [, params] = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('connector_tool_permissions'),
    ) as [string, unknown[]];
    expect(params[4]).toEqual([true]);

    mockQuery.mockClear();
    await PUT(
      req({
        connectorId: 'github',
        toolName: 'get_pull_request_diff',
        level: 'allow',
        destructive: true,
      }),
    );
    const [, readParams] = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('connector_tool_permissions'),
    ) as [string, unknown[]];
    expect(readParams[4]).toEqual([false]);
  });

  it('PUT refuses a standing allow for a critical tool with 422 and never touches the DB', async () => {
    const res = await PUT(
      req({ connectorId: 'github', toolName: 'post_issue_comment', level: 'allow' }),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: 'critical_tool_always_asks' } });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('PUT saves a standing allow for an undeclared remote tool, which is high rather than critical', async () => {
    const res = await PUT(req({ connectorId: 'custom-abc', toolName: 'do_thing', level: 'allow' }));
    expect(res.status).toBe(200);
    const [, params] = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('connector_tool_permissions'),
    ) as [string, unknown[]];
    expect(params[3]).toBe('always-allow');
  });

  it('PUT still saves ask and deny for a critical tool', async () => {
    for (const level of ['ask', 'deny'] as const) {
      const res = await PUT(req({ connectorId: 'github', toolName: 'post_issue_comment', level }));
      expect(res.status).toBe(200);
    }
  });

  it('PUT 400s an invalid level and never touches the DB', async () => {
    const res = await PUT(req({ connectorId: 'github', toolName: 'x', level: 'nonsense' }));
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('PUT revokes account-wide grants before changing standing permission in one transaction', async () => {
    await PUT(req({ connectorId: 'github', toolName: 'get_pull_request_diff', level: 'ask' }));
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('select public.revoke_connector_tool_session_grants($1, $2) as removed');
    expect(params).toEqual(['github', 'get_pull_request_diff']);
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(String(mockQuery.mock.calls[1]?.[0])).toContain(
      'insert into public.connector_tool_permissions',
    );
  });

  it('fails closed when grant revocation cannot be confirmed', async () => {
    mockQuery.mockRejectedValue(new Error('grant storage unavailable'));
    const response = await PUT(
      req({ connectorId: 'github', toolName: 'get_pull_request_diff', level: 'ask' }),
    );
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each(
    [[], [{ removed: null }], [{ removed: '1' }], [{ removed: -1 }]].map((receipt) => ({
      receipt,
    })),
  )(
    'does not change standing permissions on a malformed revocation receipt %j',
    async ({ receipt }) => {
      mockQuery.mockResolvedValue(receipt);
      const response = await PUT(req({ connectorId: 'github', toolName: 'list', level: 'ask' }));
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(recordAuditEvent).not.toHaveBeenCalled();
    },
  );

  it('throws an unsuccessful save inside the transaction and does not audit success', async () => {
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes('revoke_connector_tool_session_grants') ? [{ removed: 2 }] : [],
    );
    let committed = false;
    mockTransaction.mockImplementation(
      async (operation: (tx: DatabaseAdapter) => Promise<unknown>) => {
        const result = await operation({ query: routedQuery } as unknown as DatabaseAdapter);
        committed = true;
        return result;
      },
    );
    const response = await PUT(req({ connectorId: 'github', toolName: 'list', level: 'ask' }));
    expect(response.status).toBe(400);
    expect(committed).toBe(false);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('DELETE commits revocation even when no standing row exists and audits after commit', async () => {
    mockQuery.mockResolvedValue([{ removed: 3 }]);
    mockExecute.mockResolvedValue(0);
    mockTransaction.mockImplementation(
      async (operation: (tx: DatabaseAdapter) => Promise<unknown>) => {
        const result = await operation({
          query: routedQuery,
          execute: mockExecute,
        } as unknown as DatabaseAdapter);
        expect(recordAuditEvent).not.toHaveBeenCalled();
        return result;
      },
    );
    const response = await DELETE(deleteReq('?connectorId=github'));
    expect(await response.json()).toEqual({ success: true, removed: 3 });
    expect(mockQuery).toHaveBeenCalledWith(
      'select public.revoke_connector_tool_session_grants($1, $2) as removed',
      ['github', null],
    );
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(recordAuditEvent).toHaveBeenCalledOnce();
  });

  it('DELETE does not audit success when the standing delete fails', async () => {
    mockExecute.mockRejectedValueOnce(new Error('standing delete failed'));
    const response = await DELETE(deleteReq('?connectorId=github'));
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['PUT', () => PUT(req({ connectorId: 'github', toolName: 'list', level: 'ask' }))],
    ['DELETE', () => DELETE(deleteReq('?connectorId=github&toolName=list'))],
    ['DELETE all', () => DELETE(deleteReq('?connectorId=github'))],
  ])(
    '%s advances the connector permission generation first, inside its transaction',
    async (_name, send) => {
      let inside = false;
      let advancedInside = false;
      mockTransaction.mockImplementation(
        async (operation: (tx: DatabaseAdapter) => Promise<unknown>) => {
          inside = true;
          try {
            return await operation({
              query: routedQuery,
              execute: mockExecute,
            } as unknown as DatabaseAdapter);
          } finally {
            inside = false;
          }
        },
      );
      mockGeneration.mockImplementationOnce(async () => {
        advancedInside = inside;
        return [{ generation: '2' }];
      });

      const response = await send();

      expect(response.status).toBe(200);
      expect(advancedInside).toBe(true);
      const [sql, params] = mockGeneration.mock.calls[0]!;
      expect(sql).toContain('generation + 1');
      expect(params).toEqual(['user-owner', 'github']);
      expect(mockGeneration.mock.invocationCallOrder[0]).toBeLessThan(
        Math.min(...mockQuery.mock.invocationCallOrder, ...mockExecute.mock.invocationCallOrder),
      );
    },
  );

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
