import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetUserScopedDb, mockRequireTeamAdminAccess, mockRecordAuditEvent } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockGetUserScopedDb: vi.fn(),
    mockRequireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
    mockRecordAuditEvent: vi.fn(async () => undefined),
  }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));

import { GET, POST, DELETE } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const HOLD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function holdRow(over: Record<string, unknown> = {}) {
  return {
    id: HOLD_ID,
    organization_id: ORG,
    name: 'Matter 41',
    reason: null,
    scope: 'organization',
    subject_user_id: null,
    created_by_user_id: 'user-1',
    released_at: null,
    released_by_user_id: null,
    created_at: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

function bind({
  role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  insertThrows = null as string | null,
  releaseReturns = [
    holdRow({ released_at: '2026-08-23T01:00:00.000Z', released_by_user_id: 'user-1' }),
  ],
} = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(text)) return [{ organization_id: ORG, role }];
    if (/insert into public\.legal_holds/i.test(text)) {
      if (insertThrows) throw new Error(insertThrows);
      return [holdRow()];
    }
    if (/update public\.legal_holds/i.test(text)) return releaseReturns;
    if (/from public\.legal_holds/i.test(text)) return [holdRow()];
    if (/from public\.organization_retention_sweeps/i.test(text)) return [];
    return [];
  });
}

function req(method: string, body?: unknown): Request {
  return new Request('https://app.test/api/settings/organization/legal-holds', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
  });
});

describe('legal holds', () => {
  it('refuses a plain member on every verb', async () => {
    bind({ role: 'member' });
    expect((await GET(req('GET') as never)).status).toBe(403);
    expect((await POST(req('POST', { name: 'x', scope: 'organization' }) as never)).status).toBe(
      403,
    );
    expect((await DELETE(req('DELETE', { holdId: HOLD_ID }) as never)).status).toBe(403);
  });

  it('refuses a viewer', async () => {
    bind({ role: 'viewer' });
    expect((await GET(req('GET') as never)).status).toBe(403);
  });

  it('lists holds and sweeps for an admin', async () => {
    bind({ role: 'admin' });
    const res = await GET(req('GET') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { holds: unknown[]; sweeps: unknown[] };
    expect(body.holds).toHaveLength(1);
    expect(Array.isArray(body.sweeps)).toBe(true);
  });

  it('places an organization-wide hold and records it', async () => {
    bind({ role: 'owner' });
    const res = await POST(
      req('POST', { name: 'Matter 41', scope: 'organization', reason: 'Litigation' }) as never,
    );

    expect(res.status).toBe(201);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'legal_hold_created', organizationId: ORG }),
    );
  });

  it('refuses a member-scoped hold with no subject, which would hold nothing', async () => {
    bind({ role: 'owner' });
    const res = await POST(req('POST', { name: 'Matter 41', scope: 'member' }) as never);
    expect(res.status).toBe(400);
  });

  it('turns a duplicate hold into an explanation, not a 500', async () => {
    bind({ role: 'owner', insertThrows: 'duplicate key value violates unique constraint' });
    const res = await POST(req('POST', { name: 'Matter 41', scope: 'organization' }) as never);

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/already has an active/i);
  });

  it('records a release at critical severity', async () => {
    // Releasing a hold is the moment held records become deletable again. It is
    // the single most consequential action on this surface.
    bind({ role: 'owner' });
    const res = await DELETE(req('DELETE', { holdId: HOLD_ID }) as never);

    expect(res.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'legal_hold_released', severity: 'critical' }),
    );
  });

  it('answers the same way for another org’s hold as for an already-released one', async () => {
    // Distinguishing them would let a caller probe which hold ids exist
    // elsewhere.
    bind({ role: 'owner', releaseReturns: [] });
    const res = await DELETE(req('DELETE', { holdId: HOLD_ID }) as never);
    expect(res.status).toBe(404);
  });

  it('rejects a malformed hold id rather than querying with it', async () => {
    bind({ role: 'owner' });
    const res = await DELETE(req('DELETE', { holdId: 'not-a-uuid' }) as never);
    expect(res.status).toBe(400);
  });

  it('checks the plan entitlement before reading anything', async () => {
    bind({ role: 'owner' });
    const { AppError } = await import('@/lib/errors');
    mockRequireTeamAdminAccess.mockRejectedValueOnce(
      new AppError('SUBSCRIPTION_REQUIRED' as never, 'Upgrade required', 403),
    );
    expect((await GET(req('GET') as never)).status).toBe(403);
  });
});
