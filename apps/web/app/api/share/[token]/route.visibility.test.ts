import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { auditSpy } = vi.hoisted(() => ({
  auditSpy: vi.fn(async (_event: Record<string, unknown>) => undefined),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: auditSpy,
}));

const mocks = vi.hoisted(() => ({
  scopedQuery: vi.fn(),
  privilegedQuery: vi.fn(),
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
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mocks.privilegedQuery(...args) })),
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
