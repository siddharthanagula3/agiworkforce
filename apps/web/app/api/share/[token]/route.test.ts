import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  authUser: vi.fn(async (..._args: unknown[]) => ({ userId: 'owner-1' })),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  recordAuditEvent: vi.fn(async (..._args: unknown[]): Promise<void> => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  isAccountUnavailableError: vi.fn(() => false),
  getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: (...a: unknown[]) => mocks.recordAuditEvent(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { DELETE, GET } = await import('./route');

const TOKEN = 'a'.repeat(24);
const ORG = '11111111-1111-4111-8111-111111111111';
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

function context(token = TOKEN) {
  return { params: Promise.resolve({ token }) };
}

function del(token = TOKEN) {
  return DELETE(
    new NextRequest(`https://agiworkforce.com/api/share/${token}`, { method: 'DELETE' }),
    context(token),
  );
}

function get(token = TOKEN) {
  return GET(new NextRequest(`https://agiworkforce.com/api/share/${token}`), context(token));
}

async function writeAuditRowsForReal(): Promise<void> {
  const audit =
    await vi.importActual<typeof import('@/lib/security-audit')>('@/lib/security-audit');
  mocks.recordAuditEvent.mockImplementationOnce((...args: unknown[]) =>
    audit.recordAuditEvent(args[0] as Parameters<typeof audit.recordAuditEvent>[0]),
  );
}

function storedAuditRows(): unknown[][] {
  return mocks.execute.mock.calls
    .filter(([sql]) => /insert into security_audit_logs/i.test(String(sql)))
    .map(([, params]) => params as unknown[]);
}

describe('DELETE /api/share/[token], revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'owner-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  it('revokes the owners own link and scopes the delete to that owner', async () => {
    mocks.query.mockResolvedValue([{ id: 'share-1' }]);

    const response = await del();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('owner_id = $2');
    expect(params).toEqual([TOKEN, 'owner-1']);
  });

  it('records the revoked link by id only, never its token', async () => {
    mocks.query.mockResolvedValue([{ id: 'share-1' }]);

    await del();

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    const [event] = mocks.recordAuditEvent.mock.calls[0] as [Record<string, unknown>];
    expect(event).toMatchObject({
      userId: 'owner-1',
      eventType: 'share_link_revoked',
      detail: { resourceType: 'share_link', resourceId: 'share-1' },
    });
    expect(JSON.stringify(event['detail'])).not.toContain(TOKEN);
  });

  it('stores the route pattern as the audit endpoint, so the row never holds the live link', async () => {
    await writeAuditRowsForReal();
    mocks.query.mockResolvedValue([{ id: 'share-1' }]);
    mocks.execute.mockResolvedValue(1);

    await del();

    const rows = storedAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]![5]).toBe('/api/share/[token]');
    expect(JSON.stringify(rows[0])).not.toContain(TOKEN);
  });

  it('records the revocation in the active workspace audit log, as creation does', async () => {
    await writeAuditRowsForReal();
    mocks.query.mockImplementation(async (sql: unknown) =>
      String(sql).includes('user_settings') ? [{ organization_id: ORG }] : [{ id: 'share-1' }],
    );
    mocks.execute.mockResolvedValue(1);

    await del();

    const workspaceRows = mocks.query.mock.calls
      .filter(([sql]) => String(sql).includes('record_enterprise_audit_event'))
      .map(([, params]) => params as unknown[]);
    expect(workspaceRows).toHaveLength(1);
    expect(workspaceRows[0]![0]).toBe(ORG);
    expect(workspaceRows[0]![3]).toBe('share_link_revoked');
    expect(JSON.stringify(workspaceRows[0])).not.toContain(TOKEN);
  });

  it('does not confirm a revocation to someone who only holds the link', async () => {
    mocks.authUser.mockResolvedValue({ userId: 'stranger-2' });
    mocks.query.mockResolvedValue([]);

    const response = await del();

    expect(response.status).toBe(404);
    expect((await response.json()).success).toBeUndefined();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated revocation before touching the database', async () => {
    mocks.authUser.mockRejectedValue(new Error('no session'));

    const response = await del();

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('leaves a malformed token unqueried', async () => {
    const response = await del('not-a-share-token');

    expect(response.status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/share/[token] after revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser.mockResolvedValue({ userId: 'owner-1' });
    mocks.rateLimit.mockResolvedValue(null);
  });

  it('serves the snapshot while the share exists', async () => {
    mocks.query.mockResolvedValue([
      { token: TOKEN, title: 'Planning', messages: [], total_messages: 0, expires_at: FUTURE },
    ]);

    const response = await get();

    expect(response.status).toBe(200);
    expect((await response.json()).token).toBe(TOKEN);
  });

  it('404s once the row is gone, so a revoked link reads nothing', async () => {
    mocks.execute.mockResolvedValue(1);
    await del();
    mocks.query.mockResolvedValue([]);

    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('Planning');
  });
});
