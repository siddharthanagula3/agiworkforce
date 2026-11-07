import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { createError } from '@/lib/errors';
type ScanModule0 = typeof import('@/lib/security-audit');

const { auditSpy } = vi.hoisted(() => ({
  auditSpy: vi.fn(async (_event: Record<string, unknown>): Promise<void> => undefined),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  recordAuditEvent: auditSpy,
}));

const mocks = vi.hoisted(() => ({
  scopedQuery: vi.fn(),
  privilegedQuery: vi.fn(),
  privilegedExecute: vi.fn(),
  role: 'member' as string,
  permissions: ['content.read', 'content.share'] as string[],
  stored: {} as Record<string, string | null>,
  capturedOrganizationId: null as string | null,
  savedOrganizationId: null as string | null,
  deleteReceipts: [] as Array<{ shared_session_id: string }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getCurrentCookieUserRlsDb: vi.fn(),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.scopedQuery(...args) },
    userId: 'user-1',
    organizationId: mocks.capturedOrganizationId,
  })),
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/request-context-cache')>()),
  getCachedActiveOrganizationId: vi.fn(async () => undefined),
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.privilegedQuery(...args),
    execute: (...args: unknown[]) => mocks.privilegedExecute(...args),
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '33333333-3333-4333-8333-333333333333';
const SESSION = '22222222-2222-4222-8222-222222222222';
const CONVERSATION = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'b'.repeat(24);

const { PATCH } = await import('./route');

function call(visibility: string, headers: Record<string, string> = {}) {
  return PATCH(
    new NextRequest(`https://agiworkforce.com/api/share/${TOKEN}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
    { params: Promise.resolve({ token: TOKEN }) },
  );
}

function scopedStatements(): string[] {
  return mocks.scopedQuery.mock.calls.map(([sql]) => String(sql));
}

function policyRow(organizationId: string, externalSharingEnabled: boolean) {
  return {
    organization_id: organizationId,
    default_privacy_mode: 'byok',
    allowed_privacy_modes: ['local', 'byok'],
    allow_managed_compute: false,
    require_local_to_byok_preview: true,
    chat_sync_surfaces: ['web'],
    allow_cli_cloud_sync: false,
    allow_vscode_cloud_sync: false,
    allow_chrome_cloud_sync: false,
    audit_export_enabled: true,
    retention_days: 365,
    retention_enforced: false,
    external_sharing_enabled: externalSharingEnabled,
    allow_memory: true,
    metadata: {},
    updated_at: '2026-09-16T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = 'member';
  mocks.permissions = ['content.read', 'content.share'];
  mocks.capturedOrganizationId = ORG;
  mocks.savedOrganizationId = ORG;
  mocks.deleteReceipts = [{ shared_session_id: SESSION }];
  mocks.stored = {
    conversation_id: CONVERSATION,
    conversation_organization_id: ORG,
    grant_organization_id: ORG,
  };
  mocks.privilegedQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('left join public.web_conversations')) return [mocks.stored];
    if (sql.includes('organization_member_permissions')) {
      return [{ permissions: mocks.permissions }];
    }
    if (sql.includes('user_settings')) return [{ organization_id: mocks.savedOrganizationId }];
    if (sql.includes('organization_members'))
      return [{ organization_id: params[0], role: mocks.role }];
    return [];
  });
  mocks.scopedQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('user_settings')) return [{ organization_id: mocks.savedOrganizationId }];
    if (sql.includes('organization_members'))
      return [{ organization_id: params[0], role: mocks.role }];
    if (sql.includes('delete from public.organization_shared_sessions')) return mocks.deleteReceipts;
    if (sql.includes('insert into public.organization_shared_sessions')) {
      return [
        {
          organization_id: params[0],
          shared_session_id: SESSION,
          shared_by_user_id: 'user-1',
          created_at: '2026-09-16T00:00:00.000Z',
          token: TOKEN,
          title: 'Plan',
          owner_user_id: 'user-1',
          total_messages: 2,
          visibility: 'organization',
          expires_at: '2026-10-16T00:00:00.000Z',
        },
      ];
    }
    if (sql.includes('update public.shared_sessions')) {
      return [{ token: TOKEN, visibility: params[2], expires_at: '2026-10-16T00:00:00.000Z' }];
    }
    if (sql.includes('shared_sessions')) return [{ id: SESSION }];
    return [];
  });
});

describe('PATCH /api/share/[token], workspace audience', () => {
  it('lets a member share their conversation into the workspace', async () => {
    const response = await call('organization');

    expect(response.status).toBe(200);
    expect(
      scopedStatements().some((sql) =>
        sql.includes('insert into public.organization_shared_sessions'),
      ),
    ).toBe(true);
  });

  it('records the workspace grant by conversation id, never the token or transcript', async () => {
    await call('organization');

    expect(auditSpy).toHaveBeenCalledTimes(1);
    const event = auditSpy.mock.calls[0]![0];
    expect(event).toMatchObject({
      userId: 'user-1',
      organizationId: ORG,
      eventType: 'organization_share_granted',
    });
    expect(event['detail']).toEqual({ resourceType: 'conversation', resourceId: SESSION });
    expect(JSON.stringify(event['detail'])).not.toContain(TOKEN);
  });

  it('stores the route pattern as the audit endpoint, so the rows never hold the live link', async () => {
    const audit = await vi.importActual<ScanModule0>('@/lib/security-audit');
    auditSpy.mockImplementationOnce((event) => audit.recordAuditEvent(event as never));
    mocks.privilegedExecute.mockResolvedValue(1);

    await call('organization');

    const securityRows = mocks.privilegedExecute.mock.calls.filter(([sql]) =>
      /insert into security_audit_logs/i.test(String(sql)),
    );
    const workspaceRows = mocks.privilegedQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('record_enterprise_audit_event'),
    );
    expect(securityRows).toHaveLength(1);
    expect(workspaceRows).toHaveLength(1);
    expect(securityRows[0]![1][5]).toBe('/api/share/[token]');
    expect(JSON.stringify([securityRows, workspaceRows])).not.toContain(TOKEN);
  });

  it('records the revoke when moving a workspace share back to its public link', async () => {
    const response = await call('public');

    expect(response.status).toBe(200);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0]![0]).toMatchObject({
      organizationId: ORG,
      eventType: 'organization_share_revoked',
      detail: { resourceType: 'conversation', resourceId: SESSION },
    });
  });

  it('records no revoke when the conversation was never shared with the workspace', async () => {
    mocks.stored.grant_organization_id = null;

    const response = await call('public');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ visibility: 'public', organizationId: null });
    expect(scopedStatements().some((sql) => sql.includes('delete from'))).toBe(false);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('records nothing when the grant is refused', async () => {
    mocks.role = 'viewer';
    mocks.permissions = ['content.read'];

    await call('organization');

    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('refuses a viewer, whose role is read-only, before any grant row is written', async () => {
    mocks.role = 'viewer';
    mocks.permissions = ['content.read'];

    const response = await call('organization');

    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).toContain('read-only');
    expect(scopedStatements().some((sql) => sql.includes('organization_shared_sessions'))).toBe(
      false,
    );
    expect(scopedStatements().some((sql) => sql.includes('set visibility'))).toBe(false);
  });

  it('asks the permission grid rather than the role name, so a custom read-only role is refused too', async () => {
    mocks.role = 'member';
    mocks.permissions = ['content.read', 'audit.read'];

    expect((await call('organization')).status).toBe(403);
  });
});

describe('PATCH /api/share/[token], public sharing turned off by the workspace', () => {
  beforeEach(() => {
    const defaultQuery = mocks.privilegedQuery.getMockImplementation()!;
    mocks.privilegedQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('from public.user_settings')) return [{ organization_id: ORG }];
      if (sql.includes('from public.organization_admin_policies')) return [policyRow(ORG, false)];
      return defaultQuery(sql, params);
    });
  });

  it('keeps a workspace-only link closed instead of reopening it to anyone with the link', async () => {
    const response = await call('public');

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('external_sharing_disabled');
    expect(
      scopedStatements().some((sql) =>
        sql.includes('delete from public.organization_shared_sessions'),
      ),
    ).toBe(false);
    expect(scopedStatements().some((sql) => sql.includes('set visibility'))).toBe(false);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('still lets a public link narrow to the workspace', async () => {
    const response = await call('organization');

    expect(response.status).toBe(200);
    expect(
      scopedStatements().some((sql) =>
        sql.includes('insert into public.organization_shared_sessions'),
      ),
    ).toBe(true);
  });
});

describe('PATCH /api/share/[token], the workspace that stores the link decides', () => {
  let selectedWorkspace: string;

  beforeEach(() => {
    selectedWorkspace = ORG;
    const defaultPrivileged = mocks.privilegedQuery.getMockImplementation()!;
    mocks.privilegedQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('from public.user_settings'))
        return [{ organization_id: selectedWorkspace }];
      if (sql.includes('from public.organization_admin_policies')) {
        return params[0] === ORG ? [policyRow(ORG, false)] : [];
      }
      return defaultPrivileged(sql, params);
    });
    const defaultScoped = mocks.scopedQuery.getMockImplementation()!;
    mocks.scopedQuery.mockImplementation(async (sql: string, params: unknown[] = []) =>
      sql.includes('organization_members')
        ? [{ organization_id: selectedWorkspace, role: mocks.role }]
        : defaultScoped(sql, params),
    );
  });

  function wroteNothing(): void {
    expect(
      scopedStatements().some((sql) =>
        /(insert into|delete from) public\.organization_shared_sessions/.test(sql),
      ),
    ).toBe(false);
    expect(scopedStatements().some((sql) => sql.includes('set visibility'))).toBe(false);
    expect(auditSpy).not.toHaveBeenCalled();
  }

  it('refuses x-agi-organization-id: personal on a workspace chat link, and writes nothing', async () => {
    const response = await call('public', { 'x-agi-organization-id': 'personal' });

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toMatch(/belongs to another workspace/);
    wroteNothing();
  });

  it('asks the workspace that holds the grant even when another workspace is selected', async () => {
    mocks.capturedOrganizationId = OTHER_ORG;
    selectedWorkspace = OTHER_ORG;
    mocks.stored = {
      conversation_id: null,
      conversation_organization_id: null,
      grant_organization_id: ORG,
    };

    const response = await call('public', { 'x-agi-organization-id': OTHER_ORG });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('external_sharing_disabled');
    wroteNothing();
  });

  it('refuses to reopen a workspace chat link from another selected workspace', async () => {
    selectedWorkspace = OTHER_ORG;
    mocks.capturedOrganizationId = OTHER_ORG;

    const response = await call('public');

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toMatch(/belongs to another workspace/);
    wroteNothing();
  });

  it('keeps a workspace chat link out of another workspace', async () => {
    selectedWorkspace = OTHER_ORG;
    mocks.capturedOrganizationId = OTHER_ORG;

    const response = await call('organization');

    expect(response.status).toBe(403);
    wroteNothing();
  });
});

describe('PATCH /api/share/[token], captured audience and confirmed revocation', () => {
  beforeEach(() => {
    mocks.capturedOrganizationId = OTHER_ORG;
    mocks.savedOrganizationId = ORG;
    mocks.stored = {
      conversation_id: null,
      conversation_organization_id: null,
      grant_organization_id: ORG,
    };
  });

  function callsContaining(fragment: string) {
    return mocks.scopedQuery.mock.calls.filter(([sql]) => String(sql).includes(fragment));
  }

  function expectNoVisibilityWriteOrAudit() {
    expect(callsContaining('update public.shared_sessions')).toHaveLength(0);
    expect(auditSpy).not.toHaveBeenCalled();
  }

  for (const explicit of [false, true]) {
    it(`uses captured B, not saved A, for an organization grant (${explicit ? 'explicit' : 'headerless'})`, async () => {
      mocks.stored.grant_organization_id = null;

      const response = await call(
        'organization',
        explicit ? { 'x-agi-organization-id': OTHER_ORG } : {},
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        visibility: 'organization', organizationId: OTHER_ORG,
      });
      expect(callsContaining('organization_members')).toEqual([
        [expect.stringContaining("and status = 'active'"), [OTHER_ORG, 'user-1']],
      ]);
      expect(callsContaining('organization_members')[0]![0]).toContain(
        'where organization_id = $1 and user_id = $2',
      );
      expect(callsContaining('user_settings')).toHaveLength(0);
      expect(callsContaining('insert into public.organization_shared_sessions')[0]![1]).toEqual([
        OTHER_ORG, SESSION, 'user-1',
      ]);
      expect(mocks.privilegedQuery.mock.calls).toContainEqual([
        expect.stringContaining('organization_member_permissions'), [OTHER_ORG, 'user-1'],
      ]);
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ organizationId: OTHER_ORG }));
    });

    it(`removes and audits observed grant A while selected B (${explicit ? 'explicit' : 'headerless'})`, async () => {
      const response = await call(
        'public',
        explicit ? { 'x-agi-organization-id': OTHER_ORG } : {},
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ token: TOKEN, visibility: 'public', organizationId: null });
      expect(callsContaining('delete from public.organization_shared_sessions')).toEqual([
        [expect.stringContaining('returning shared_session_id'), [ORG, SESSION]],
      ]);
      expect(callsContaining('update public.shared_sessions')).toEqual([
        [expect.stringContaining('where token = $1 and owner_id = $2'), [TOKEN, 'user-1', 'public']],
      ]);
      expect(mocks.privilegedQuery.mock.calls.some(([sql]) =>
        /(?:delete from|update|insert into) public\.(?:shared_sessions|organization_shared_sessions)/.test(String(sql)),
      )).toBe(false);
      expect(auditSpy).toHaveBeenCalledTimes(1);
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: ORG,
        eventType: 'organization_share_revoked',
        detail: { resourceType: 'conversation', resourceId: SESSION },
      }));
    });
  }

  for (const visibility of ['public', 'organization']) {
    it(`refuses Personal before ${visibility} mutation, even with saved membership A`, async () => {
      mocks.capturedOrganizationId = null;

      expect((await call(visibility, { 'x-agi-organization-id': 'personal' })).status).toBe(403);
      expect(mocks.scopedQuery).not.toHaveBeenCalled();
      expectNoVisibilityWriteOrAudit();
    });

    for (const membershipRows of [[], [{ organization_id: ORG, role: 'member' }]]) {
      it(`refuses ${visibility} when captured B membership is absent or mismatched (${membershipRows.length})`, async () => {
        const defaultQuery = mocks.scopedQuery.getMockImplementation()!;
        mocks.scopedQuery.mockImplementation(async (sql: string, params: unknown[]) =>
          sql.includes('organization_members') ? membershipRows : defaultQuery(sql, params),
        );

        expect((await call(visibility)).status).toBe(403);
        expect(callsContaining('shared_sessions')).toHaveLength(0);
        expectNoVisibilityWriteOrAudit();
      });
    }
  }

  it('refuses missing content.share in captured B despite membership and saved A', async () => {
    mocks.permissions = ['content.read'];
    expect((await call('organization')).status).toBe(403);
    expect(callsContaining('insert into public.organization_shared_sessions')).toHaveLength(0);
    expectNoVisibilityWriteOrAudit();
  });

  for (const deniedScope of ['conversation', 'grant']) {
    it(`preserves the stored ${deniedScope} external-sharing denial with selected B`, async () => {
      mocks.stored.conversation_id = CONVERSATION;
      mocks.stored.conversation_organization_id = OTHER_ORG;
      mocks.savedOrganizationId = OTHER_ORG;
      const deniedOrganizationId = deniedScope === 'conversation' ? OTHER_ORG : ORG;
      const defaultQuery = mocks.privilegedQuery.getMockImplementation()!;
      mocks.privilegedQuery.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes('from public.organization_admin_policies')) {
          return [policyRow(String(params[0]), params[0] !== deniedOrganizationId)];
        }
        return defaultQuery(sql, params);
      });

      const response = await call('public', { 'x-agi-organization-id': OTHER_ORG });

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('external_sharing_disabled');
      expect(mocks.privilegedQuery.mock.calls).toContainEqual([
        expect.stringContaining('from public.organization_admin_policies'), [deniedOrganizationId],
      ]);
      expect(callsContaining('delete from public.organization_shared_sessions')).toHaveLength(0);
      expectNoVisibilityWriteOrAudit();
    });
  }

  it('keeps a headerless conversation in A out of captured B before any mutation', async () => {
    mocks.stored.conversation_id = CONVERSATION;
    mocks.stored.conversation_organization_id = ORG;

    expect((await call('public')).status).toBe(403);
    expect(callsContaining('delete from public.organization_shared_sessions')).toHaveLength(0);
    expectNoVisibilityWriteOrAudit();
  });

  it('does not look up or mutate a session when authentication fails', async () => {
    vi.mocked(getUserScopedDb).mockRejectedValueOnce(createError.unauthorized());

    expect((await call('public')).status).toBe(401);
    expect(mocks.scopedQuery).not.toHaveBeenCalled();
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
    expectNoVisibilityWriteOrAudit();
  });

  it('keeps the CSRF refusal ahead of authentication and storage', async () => {
    vi.mocked(requireCsrfToken).mockResolvedValueOnce(
      NextResponse.json({ error: 'csrf refused' }, { status: 403 }),
    );

    expect((await call('public')).status).toBe(403);
    expect(getUserScopedDb).not.toHaveBeenCalled();
    expect(withRateLimit).not.toHaveBeenCalled();
    expect(mocks.scopedQuery).not.toHaveBeenCalled();
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  });

  it('keeps the rate refusal ahead of authentication and storage', async () => {
    vi.mocked(withRateLimit).mockResolvedValueOnce(
      NextResponse.json({ error: 'rate refused' }, { status: 429 }),
    );

    expect((await call('public')).status).toBe(429);
    expect(getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.scopedQuery).not.toHaveBeenCalled();
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', []],
    ['mismatched', [{ shared_session_id: CONVERSATION }]],
    ['multiple', [{ shared_session_id: SESSION }, { shared_session_id: SESSION }]],
  ])('refuses an observed grant with %s delete receipts before publishing', async (_label, receipts) => {
    mocks.deleteReceipts = receipts as Array<{ shared_session_id: string }>;

    expect((await call('public')).status).toBe(409);
    expect(callsContaining('delete from public.organization_shared_sessions')).toHaveLength(1);
    expectNoVisibilityWriteOrAudit();
  });

  it('binds stored scope and the mutable session lookup to owner and token', async () => {
    const defaultQuery = mocks.scopedQuery.getMockImplementation()!;
    mocks.scopedQuery.mockImplementation(async (sql: string, params: unknown[]) =>
      sql.includes('select id from public.shared_sessions') ? [] : defaultQuery(sql, params),
    );

    expect((await call('public')).status).toBe(404);
    expect(mocks.privilegedQuery.mock.calls).toContainEqual([
      expect.stringContaining('where session.token = $1 and session.owner_id = $2'),
      [TOKEN, 'user-1'],
    ]);
    expect(callsContaining('select id from public.shared_sessions')).toEqual([
      [expect.stringContaining('where token = $1 and owner_id = $2'), [TOKEN, 'user-1']],
    ]);
    expect(callsContaining('delete from public.organization_shared_sessions')).toHaveLength(0);
    expectNoVisibilityWriteOrAudit();
  });

  it('refuses an owner-scoped snapshot miss before membership or writes', async () => {
    const defaultQuery = mocks.privilegedQuery.getMockImplementation()!;
    mocks.privilegedQuery.mockImplementation(async (sql: string, params: unknown[]) =>
      sql.includes('left join public.web_conversations') ? [] : defaultQuery(sql, params),
    );

    expect((await call('public')).status).toBe(404);
    expect(mocks.scopedQuery).not.toHaveBeenCalled();
    expectNoVisibilityWriteOrAudit();
  });

  it('does not publish after a grant deletion database error', async () => {
    const defaultQuery = mocks.scopedQuery.getMockImplementation()!;
    mocks.scopedQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('delete from public.organization_shared_sessions')) {
        throw new Error('delete unavailable');
      }
      return defaultQuery(sql, params);
    });

    expect((await call('public')).status).toBe(500);
    expect(callsContaining('delete from public.organization_shared_sessions')).toHaveLength(1);
    expectNoVisibilityWriteOrAudit();
  });

  it('does not relocate an existing A grant when a B grant encounters the unique constraint', async () => {
    const defaultQuery = mocks.scopedQuery.getMockImplementation()!;
    mocks.scopedQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('insert into public.organization_shared_sessions')) {
        throw Object.assign(new Error('unique constraint'), { code: '23505' });
      }
      return defaultQuery(sql, params);
    });

    expect((await call('organization')).status).toBeGreaterThanOrEqual(400);
    expect(callsContaining('insert into public.organization_shared_sessions')[0]![1]).toEqual([
      OTHER_ORG, SESSION, 'user-1',
    ]);
    expect(callsContaining('delete from public.organization_shared_sessions')).toHaveLength(0);
    expectNoVisibilityWriteOrAudit();
  });

  it('does not claim success or audit if visibility update finds no row after confirmed deletion', async () => {
    const defaultQuery = mocks.scopedQuery.getMockImplementation()!;
    mocks.scopedQuery.mockImplementation(async (sql: string, params: unknown[]) =>
      sql.includes('update public.shared_sessions') ? [] : defaultQuery(sql, params),
    );

    expect((await call('public')).status).toBe(404);
    expect(callsContaining('delete from public.organization_shared_sessions')).toHaveLength(1);
    expect(callsContaining('update public.shared_sessions')).toHaveLength(1);
    expect(callsContaining('insert into public.organization_shared_sessions')).toHaveLength(0);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it('does not claim a successful response if audit fails after both independent writes', async () => {
    auditSpy.mockRejectedValueOnce(new Error('audit unavailable'));

    expect((await call('public')).status).toBe(500);
    expect(callsContaining('delete from public.organization_shared_sessions')).toHaveLength(1);
    expect(callsContaining('update public.shared_sessions')).toHaveLength(1);
    expect(callsContaining('insert into public.organization_shared_sessions')).toHaveLength(0);
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });
});
