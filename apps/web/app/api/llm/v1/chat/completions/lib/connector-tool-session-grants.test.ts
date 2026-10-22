import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ToolApprovalRiskTier } from '@agiworkforce/cloud-contracts';
import {
  connectorToolPermissionsFromEntries,
  loadConnectorToolPermissions,
  saveScopedConnectorToolApprovals,
  LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
  scopeConnectorPermissionsToTurn,
  withSessionGrants,
  withWorkspaceToolRules,
} from './connector-tool-permissions';
import {
  CHAT_COMPLETIONS_TRUST_BOUNDARY,
  insertConnectorToolSessionGrants,
  loadConnectorToolSessionGrants,
  NO_SESSION_GRANTS,
  planScopedToolApprovals,
} from './connector-tool-session-grants';

const CONVERSATION_A = '0190a000-0000-7000-8000-00000000000a';
const CONVERSATION_B = '0190a000-0000-7000-8000-00000000000b';

function grantRisks(keys: readonly string[], risk: ToolApprovalRiskTier = 'high') {
  return new Map(keys.map((key) => [key, risk]));
}

function transactionDb(query: DatabaseAdapter['query']): DatabaseAdapter {
  const db = {
    query,
    transaction: async <T>(run: (tx: DatabaseAdapter) => Promise<T>) => run(db as DatabaseAdapter),
  };
  return db as DatabaseAdapter;
}

function grantTable() {
  const rows: Array<{
    user_id: string;
    conversation_id: string;
    connector_id: string;
    tool_name: string;
    trust_boundary: string;
    risk_tier: string;
    organization_id: string | null;
  }> = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    const source = sql.replace(/--[^\n]*/gu, '');
    expect(source).toContain('conversation.organization_id is not distinct from');
    expect(source).toContain('conversation.deleted_at is null');
    expect(source).toContain('conversation.is_temporary = false');
    if (source.includes('delete from public.connector_tool_session_grants')) {
      expect(source).toContain('grant_row.user_id = $1');
      expect(source).toContain('grant_row.conversation_id = $2');
      expect(source).toContain('grant_row.trust_boundary = $5');
      return [];
    }
    if (source.includes('insert into public.connector_tool_session_grants')) {
      expect(source).toContain('conversation.id = $2 and conversation.user_id = $1');
      const [
        user_id,
        conversation_id,
        connector_id,
        tool_name,
        trust_boundary,
        ,
        risk_tier,
        organization_id,
      ] = params as [string, string, string, string, string, boolean, string, string | null];
      rows.push({
        user_id,
        conversation_id,
        connector_id,
        tool_name,
        trust_boundary,
        risk_tier,
        organization_id,
      });
      return [{ id: `grant-${rows.length}` }];
    }
    expect(source).toContain('conversation.user_id = grant_row.user_id');
    expect(source).toContain('grant_row.user_id = $1');
    expect(source).toContain('grant_row.conversation_id = $2');
    expect(source).toContain('grant_row.trust_boundary = $3');
    const [user_id, conversation_id, trust_boundary, organization_id] = params;
    return rows.filter(
      (row) =>
        row.user_id === user_id &&
        row.conversation_id === conversation_id &&
        row.trust_boundary === trust_boundary &&
        row.organization_id === organization_id,
    );
  });
  return { db: transactionDb(query as DatabaseAdapter['query']), query };
}

const scope = (conversationId: string, trustBoundary = CHAT_COMPLETIONS_TRUST_BOUNDARY) => ({
  userId: 'user-1',
  organizationId: null,
  conversationId,
  trustBoundary,
});

function permissionDatabase(
  options: {
    workspaceLevel?: 'allow' | 'ask' | 'deny';
    standingUnavailable?: boolean;
    grantsUnavailable?: boolean;
  } = {},
) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from public.user_settings')) return [{ settings: {} }];
    if (sql.includes('from public.connector_account_states')) return [];
    if (sql.includes('from public.connector_tool_permissions')) {
      if (options.standingUnavailable) throw new Error('Standing permissions unavailable');
      return [{ connector_id: 'github', tool_name: 'create_issue', level: 'needs-approval' }];
    }
    if (sql.includes('from public.connector_tool_session_grants')) {
      if (options.grantsUnavailable)
        throw Object.assign(new Error('Grant storage unavailable'), { code: '42P01' });
      return [{ connector_id: 'github', tool_name: 'create_issue', risk_tier: 'high' }];
    }
    if (sql.includes('from public.organization_connector_policies'))
      return [
        {
          organization_id: '0190a000-0000-7000-8000-000000000010',
          allowed_connectors: [],
          blocked_connectors: [],
          allow_custom_connectors: true,
          tool_rules: options.workspaceLevel
            ? [{ connectorId: 'github', toolName: 'create_issue', level: options.workspaceLevel }]
            : [],
          updated_at: '2026-10-14T00:00:00.000Z',
        },
      ];
    throw new Error('Unexpected permission query');
  });
  return { db: transactionDb(query as DatabaseAdapter['query']), query };
}

describe('connector tool session grants', () => {
  it.each(['ask', 'deny'] as const)(
    'the actual permission loader keeps workspace %s final',
    async (level) => {
      const { db } = permissionDatabase({ workspaceLevel: level });
      const permissions = await loadConnectorToolPermissions(
        db,
        'user-1',
        '0190a000-0000-7000-8000-000000000010',
        scope(CONVERSATION_A),
      );
      expect(permissions.levelFor('mcp__github__create_issue')).toBe(level);
      expect(permissions.isSessionGranted?.('mcp__github__create_issue')).toBe(false);
      expect(permissions.canRememberApproval?.('mcp__github__create_issue')).toBe(false);
    },
  );

  it('the actual permission loader preserves a valid grant when no workspace rule overrides it', async () => {
    const { db } = permissionDatabase();
    const permissions = await loadConnectorToolPermissions(
      db,
      'user-1',
      '0190a000-0000-7000-8000-000000000010',
      scope(CONVERSATION_A),
    );
    expect(permissions.levelFor('mcp__github__create_issue')).toBe('allow');
    expect(permissions.isSessionGranted?.('mcp__github__create_issue')).toBe(true);
    expect(permissions.sessionGrantsAvailable).toBe(true);
  });

  it('cannot use a grant to bypass an unreadable saved denial', async () => {
    const { db, query } = permissionDatabase({ standingUnavailable: true });
    const permissions = await loadConnectorToolPermissions(
      db,
      'user-1',
      null,
      scope(CONVERSATION_A),
    );
    expect(permissions.levelFor('mcp__github__create_issue')).not.toBe('allow');
    expect(permissions.canRememberApproval?.('mcp__github__create_issue')).toBe(false);
    expect(permissions.sessionGrantsAvailable).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('connector_tool_session_grants'))).toBe(
      false,
    );
  });

  it('reports unavailable grant storage without advertising conversation scope', async () => {
    const { db } = permissionDatabase({ grantsUnavailable: true });
    const permissions = await loadConnectorToolPermissions(
      db,
      'user-1',
      null,
      scope(CONVERSATION_A),
    );
    expect(permissions.levelFor('mcp__github__create_issue')).toBe('ask');
    expect(permissions.sessionGrantsAvailable).toBe(false);
  });

  it('refuses a stored grant whose current tool risk has increased', () => {
    const permissions = withSessionGrants(
      connectorToolPermissionsFromEntries([
        { connectorId: 'github', toolName: 'create_issue', level: 'ask' },
      ]),
      grantRisks(['github create_issue'], 'low'),
    );
    expect(permissions.levelFor('mcp__github__create_issue')).toBe('ask');
    expect(permissions.isSessionGranted?.('mcp__github__create_issue')).not.toBe(true);
  });

  it('rechecks a newly destructive server annotation against the risk that was approved', () => {
    const permissions = withWorkspaceToolRules(
      withSessionGrants(connectorToolPermissionsFromEntries([]), grantRisks(['acme perform'])),
      [{ connectorId: 'notion', toolName: 'search', level: 'ask' }],
    );
    expect(permissions.isSessionGranted?.('mcp__acme__perform', 'high')).toBe(true);
    expect(permissions.isSessionGranted?.('mcp__acme__perform', 'critical')).toBe(false);
  });

  it.each(['ask', 'deny'] as const)(
    'preserves a workspace %s after the member grants a conversation scope',
    (level) => {
      const granted = withSessionGrants(
        connectorToolPermissionsFromEntries([
          { connectorId: 'github', toolName: 'create_issue', level: 'ask' },
        ]),
        grantRisks(['github create_issue']),
      );
      const governed = withWorkspaceToolRules(granted, [
        { connectorId: 'github', toolName: 'create_issue', level },
      ]);
      expect(governed.levelFor('mcp__github__create_issue')).toBe(level);
      expect(governed.isSessionGranted?.('mcp__github__create_issue')).toBe(false);
      expect(governed.entries).toContainEqual({
        connectorId: 'github',
        toolName: 'create_issue',
        level,
      });
    },
  );

  it('keeps an unrelated workspace rule from discarding an admitted session grant', () => {
    const permissions = withWorkspaceToolRules(
      withSessionGrants(
        connectorToolPermissionsFromEntries([]),
        grantRisks(['github create_issue']),
      ),
      [{ connectorId: 'notion', toolName: 'search', level: 'ask' }],
    );
    expect(permissions.levelFor('mcp__github__create_issue')).toBe('allow');
    expect(permissions.isSessionGranted?.('mcp__github__create_issue')).toBe(true);
    expect(permissions.entries).toContainEqual({
      connectorId: 'github',
      toolName: 'create_issue',
      level: 'allow',
    });
  });

  it('does not carry session grants into a temporary chat or a disabled connector', () => {
    const granted = withSessionGrants(
      connectorToolPermissionsFromEntries([]),
      grantRisks(['github create_issue']),
    );
    const temporary = scopeConnectorPermissionsToTurn(granted, {
      temporary: true,
      disabledConnectorIds: undefined,
    });
    expect(temporary.levelFor('mcp__github__create_issue')).toBe('ask');
    expect(temporary.isSessionGranted?.('mcp__github__create_issue')).toBe(false);
    const disabled = scopeConnectorPermissionsToTurn(granted, {
      temporary: false,
      disabledConnectorIds: ['github'],
    });
    expect(disabled.isDenied('mcp__github__create_issue')).toBe(true);
    expect(disabled.isSessionGranted?.('mcp__github__create_issue')).toBe(false);
    expect(
      withSessionGrants(
        LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
        grantRisks(['github create_issue']),
      ),
    ).toBe(LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS);
  });

  it('reads a grant back only in the conversation and trust boundary it was made in', async () => {
    const { db } = grantTable();
    await insertConnectorToolSessionGrants(db, scope(CONVERSATION_A), [
      {
        connectorId: 'github',
        toolName: 'create_issue',
        destructive: false,
        riskTier: 'high' as const,
      },
    ]);

    expect(await loadConnectorToolSessionGrants(db, scope(CONVERSATION_A))).toEqual(
      grantRisks(['github create_issue']),
    );
    expect((await loadConnectorToolSessionGrants(db, scope(CONVERSATION_B))).size).toBe(0);
    expect((await loadConnectorToolSessionGrants(db, scope(CONVERSATION_A, 'byok'))).size).toBe(0);
    expect((await loadConnectorToolSessionGrants(db, scope(CONVERSATION_A, 'local'))).size).toBe(0);
    expect(
      (
        await loadConnectorToolSessionGrants(db, {
          ...scope(CONVERSATION_A),
          userId: 'user-2',
        })
      ).size,
    ).toBe(0);
    expect(
      (
        await loadConnectorToolSessionGrants(db, {
          ...scope(CONVERSATION_A),
          organizationId: '0190a000-0000-7000-8000-000000000010',
        })
      ).size,
    ).toBe(0);
  });

  it('chat completions grants live under Managed Cloud', () => {
    expect(CHAT_COMPLETIONS_TRUST_BOUNDARY).toBe('managed');
  });

  it('yields no grants when the read fails, so every tool asks', async () => {
    const db = transactionDb(
      vi.fn(async () => {
        throw Object.assign(new Error('connection reset'), { code: '08006' });
      }),
    );
    expect(await loadConnectorToolSessionGrants(db, scope(CONVERSATION_A))).toBe(NO_SESSION_GRANTS);
  });

  it('reports a scoped write failure when the grants table does not exist yet', async () => {
    const db = transactionDb(
      vi.fn(async () => {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      }),
    );
    const grant = {
      connectorId: 'github',
      toolName: 'create_issue',
      destructive: false,
      riskTier: 'high' as const,
    };

    await expect(
      insertConnectorToolSessionGrants(db, scope(CONVERSATION_A), [grant]),
    ).rejects.toMatchObject({ code: '42P01' });
    expect(await loadConnectorToolSessionGrants(db, scope(CONVERSATION_A))).toBe(NO_SESSION_GRANTS);
  });

  it('still fails a grant write for any other database error', async () => {
    const db = transactionDb(
      vi.fn(async () => {
        throw Object.assign(new Error('connection reset'), { code: '08006' });
      }),
    );
    const grant = {
      connectorId: 'github',
      toolName: 'create_issue',
      destructive: false,
      riskTier: 'high' as const,
    };

    await expect(
      insertConnectorToolSessionGrants(db, scope(CONVERSATION_A), [grant]),
    ).rejects.toThrow('connection reset');
  });

  it('turns ask into allow for a granted tool and leaves every other verdict alone', () => {
    const permissions = withSessionGrants(
      connectorToolPermissionsFromEntries([
        { connectorId: 'github', toolName: 'create_issue', level: 'ask' },
        { connectorId: 'github', toolName: 'delete_repo', level: 'deny' },
      ]),
      grantRisks(['github create_issue', 'github delete_repo', 'github list_issues']),
    );
    expect(permissions.levelFor('mcp__github__create_issue')).toBe('allow');
    expect(permissions.levelFor('mcp__github__list_issues')).toBe('allow');
    expect(permissions.levelFor('mcp__github__delete_repo')).toBe('deny');
    expect(permissions.isDenied('mcp__github__delete_repo')).toBe(true);
    expect(permissions.levelFor('mcp__github__get_pull_request_diff')).toBeUndefined();
    expect(permissions.levelForConnectorTool('github', 'create_issue')).toBe('allow');
  });
});

describe('planScopedToolApprovals', () => {
  const pending = [
    { id: 'read', qualifiedName: 'mcp__github__get_pull_request_diff' },
    { id: 'comment', qualifiedName: 'mcp__github__post_issue_comment' },
    { id: 'custom', qualifiedName: 'mcp__custom-abc__do_thing' },
    { id: 'search', qualifiedName: 'web_search' },
  ];

  it('passes a once approval through with nothing to remember', () => {
    expect(
      planScopedToolApprovals(
        [{ tool_call_id: 'comment', decision: 'approved' }],
        pending,
        CONVERSATION_A,
      ),
    ).toEqual({ ok: true, scoped: [] });
  });

  it('remembers a session approval, recording whether the tool is destructive', () => {
    expect(
      planScopedToolApprovals(
        [{ tool_call_id: 'comment', decision: 'approved-for-session' }],
        pending,
        CONVERSATION_A,
      ),
    ).toEqual({
      ok: true,
      scoped: [
        {
          toolCallId: 'comment',
          scope: 'session',
          connectorId: 'github',
          toolName: 'post_issue_comment',
          destructive: true,
          critical: true,
          riskTier: 'critical',
        },
      ],
    });
  });

  it('remembers an always approval for a declared non-destructive tool', () => {
    const plan = planScopedToolApprovals(
      [{ tool_call_id: 'read', decision: 'approved-always' }],
      pending,
      CONVERSATION_A,
    );
    expect(plan).toMatchObject({ ok: true, scoped: [{ scope: 'always', destructive: false }] });
  });

  it('never plans an always approval for a critical tool', () => {
    expect(
      planScopedToolApprovals(
        [{ tool_call_id: 'comment', decision: 'approved-always' }],
        pending,
        CONVERSATION_A,
      ).ok,
    ).toBe(false);
  });

  it('plans an always approval for an undeclared tool, which is high rather than critical', () => {
    expect(
      planScopedToolApprovals(
        [{ tool_call_id: 'custom', decision: 'approved-always' }],
        pending,
        CONVERSATION_A,
      ),
    ).toMatchObject({
      ok: true,
      scoped: [{ scope: 'always', destructive: true, critical: false }],
    });
  });

  it('treats a server destructiveHint as critical, so always is refused', () => {
    expect(
      planScopedToolApprovals(
        [{ tool_call_id: 'custom', decision: 'approved-always' }],
        pending,
        CONVERSATION_A,
        (name) => (name === 'mcp__custom-abc__do_thing' ? { destructiveHint: true } : undefined),
      ).ok,
    ).toBe(false);
  });

  it('ignores a readOnlyHint, which cannot lower an undeclared tool', () => {
    expect(
      planScopedToolApprovals(
        [{ tool_call_id: 'custom', decision: 'approved-for-session' }],
        pending,
        CONVERSATION_A,
        () => ({ readOnlyHint: true }),
      ),
    ).toMatchObject({ ok: true, scoped: [{ destructive: true, critical: false }] });
  });

  it('marks a session grant for a session-granted permission set', () => {
    const permissions = withSessionGrants(
      connectorToolPermissionsFromEntries([
        { connectorId: 'github', toolName: 'post_issue_comment', level: 'allow' },
      ]),
      grantRisks(['github create_issue']),
    );
    expect(permissions.isSessionGranted?.('mcp__github__create_issue')).toBe(true);
    expect(permissions.isSessionGranted?.('mcp__github__post_issue_comment')).toBe(false);
  });

  it('refuses a session approval without a conversation to scope it to', () => {
    expect(
      planScopedToolApprovals(
        [{ tool_call_id: 'read', decision: 'approved-for-session' }],
        pending,
        null,
      ).ok,
    ).toBe(false);
  });

  it('refuses to remember anything for a tool that is not a connector tool', () => {
    expect(
      planScopedToolApprovals(
        [{ tool_call_id: 'search', decision: 'approved-for-session' }],
        pending,
        CONVERSATION_A,
      ).ok,
    ).toBe(false);
  });
});

describe('one transaction for mixed scoped permissions', () => {
  function atomicDb(fail: 'standing' | 'session' | 'conflict' | undefined) {
    let persisted = ['existing-permission'];
    const nested = vi.fn(async () => {
      throw new Error('Nested transactions are unsupported');
    });
    const outside = vi.fn(async () => {
      throw new Error('Write escaped transaction');
    });
    const statements: string[] = [];
    const transaction = vi.fn(async (operation: (tx: DatabaseAdapter) => Promise<void>) => {
      const pending = [...persisted];
      const query = vi.fn(async (sql: string, params: unknown[]) => {
        statements.push(sql);
        if (sql.includes('insert into public.connector_tool_permissions')) {
          if (fail === 'standing') throw new Error('Standing write failed');
          if (fail === 'conflict') return [];
          pending.push('standing');
          return (params[2] as string[]).map((tool_name) => ({ tool_name }));
        }
        if (sql.includes('insert into public.connector_tool_session_grants')) {
          if (fail === 'session') throw new Error('Session write failed');
          pending.push('session');
          return [{ id: 'owned-grant' }];
        }
        if (sql.includes('delete from public.connector_tool_session_grants')) return [];
        throw new Error('Unexpected scoped persistence statement');
      });
      await operation({ query, transaction: nested } as unknown as DatabaseAdapter);
      persisted = pending;
    });
    return {
      db: { query: outside, transaction } as unknown as DatabaseAdapter,
      persisted: () => persisted,
      transaction,
      nested,
      outside,
      statements,
    };
  }

  const input = {
    ...scope(CONVERSATION_A),
    approvals: [
      {
        toolCallId: 'session-call',
        connectorId: 'custom-fixture',
        toolName: 'update_record',
        scope: 'session' as const,
        destructive: true,
        riskTier: 'high' as const,
        critical: false,
      },
      {
        toolCallId: 'always-call',
        connectorId: 'github',
        toolName: 'get_pull_request_diff',
        scope: 'always' as const,
        destructive: false,
        riskTier: 'low' as const,
        critical: false,
      },
    ],
  };

  it('commits both kinds through the same adapter without a nested transaction', async () => {
    const fixture = atomicDb(undefined);
    await saveScopedConnectorToolApprovals(fixture.db, input);
    expect(fixture.persisted()).toEqual(['existing-permission', 'standing', 'session']);
    expect(fixture.transaction).toHaveBeenCalledOnce();
    expect(fixture.nested).not.toHaveBeenCalled();
    expect(fixture.outside).not.toHaveBeenCalled();
  });

  it.each(['standing', 'session', 'conflict'] as const)(
    'does not commit either scope when %s persistence fails',
    async (failure) => {
      const fixture = atomicDb(failure);
      await expect(saveScopedConnectorToolApprovals(fixture.db, input)).rejects.toThrow();
      expect(fixture.persisted()).toEqual(['existing-permission']);
      expect(fixture.transaction).toHaveBeenCalledOnce();
      expect(fixture.nested).not.toHaveBeenCalled();
      expect(fixture.outside).not.toHaveBeenCalled();
      if (failure === 'session') {
        expect(
          fixture.statements.some((sql) =>
            sql.includes('insert into public.connector_tool_permissions'),
          ),
        ).toBe(true);
        expect(
          fixture.statements.some((sql) =>
            sql.includes('insert into public.connector_tool_session_grants'),
          ),
        ).toBe(true);
      }
    },
  );
});
