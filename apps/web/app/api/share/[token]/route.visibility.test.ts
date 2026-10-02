import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
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
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getCurrentUserRlsDb: vi.fn(),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.scopedQuery(...args) },
    userId: 'user-1',
    organizationId: ORG,
  })),
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
const SESSION = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'b'.repeat(24);

const { PATCH } = await import('./route');

function call(visibility: string) {
  return PATCH(
    new NextRequest(`https://agiworkforce.com/api/share/${TOKEN}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ token: TOKEN }) },
  );
}

function scopedStatements(): string[] {
  return mocks.scopedQuery.mock.calls.map(([sql]) => String(sql));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = 'member';
  mocks.permissions = ['content.read', 'content.share'];
  mocks.privilegedQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('organization_member_permissions')) {
      return [{ permissions: mocks.permissions }];
    }
    if (sql.includes('organization_members')) return [{ role: mocks.role }];
    return [];
  });
  mocks.scopedQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('organization_members')) return [{ organization_id: ORG, role: mocks.role }];
    if (sql.includes('user_settings')) return [{ organization_id: ORG }];
    if (sql.includes('insert into public.organization_shared_sessions')) {
      return [
        {
          organization_id: ORG,
          shared_session_id: SESSION,
          shared_by_user_id: 'user-1',
          created_at: '2026-09-16T00:00:00.000Z',
          token: TOKEN,
          title: 'Plan',
          owner_id: 'user-1',
          total_messages: 2,
          visibility: 'organization',
          expires_at: '2026-10-16T00:00:00.000Z',
        },
      ];
    }
    if (sql.includes('update public.shared_sessions')) {
      return [{ token: TOKEN, visibility: 'organization', expires_at: '2026-10-16T00:00:00.000Z' }];
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
    const defaultQuery = mocks.scopedQuery.getMockImplementation()!;
    mocks.scopedQuery.mockImplementation(async (sql: string) =>
      sql.includes('delete from public.organization_shared_sessions') ? [] : defaultQuery(sql),
    );

    await call('public');

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
    mocks.privilegedQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.user_settings')) return [{ organization_id: ORG }];
      if (sql.includes('from public.organization_admin_policies')) {
        return [
          {
            organization_id: ORG,
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
            external_sharing_enabled: false,
            allow_memory: true,
            metadata: {},
            updated_at: '2026-09-16T00:00:00.000Z',
          },
        ];
      }
      return defaultQuery(sql);
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
