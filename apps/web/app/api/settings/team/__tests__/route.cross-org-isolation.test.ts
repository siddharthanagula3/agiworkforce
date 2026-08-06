import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockTransaction } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'org-a-admin' })),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({
    plan: 'team',
    canManageTeam: true,
    maxMembers: 10,
    seatsConsumed: 1,
    seatsAvailable: 9,
    seatSource: 'billing',
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  })),
}));

import { GET, POST } from '../route';
import { DELETE, PATCH } from '../[memberId]/route';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

/**
 * The membership table as it really is: `org-a-admin` administers ORG_A and has
 * NO row in ORG_B. Every handler below runs against this one fixture, so a
 * handler that forgets its `organization_id` predicate necessarily reads or
 * writes ORG_B rows and the test goes red.
 *
 * These routes run on the privileged `getNeonDb()` connection, which HAS
 * BYPASSRLS (documented in 0037 and in scripts/check-db-isolation.mjs). The
 * 0085 policies are defence in depth behind these predicates, NOT a substitute
 * for them — which is exactly why this file exercises the predicates directly.
 */
const MEMBERSHIPS: Record<string, Record<string, unknown>> = {
  [`${ORG_A}:org-a-admin`]: {
    organization_id: ORG_A,
    user_id: 'org-a-admin',
    role: 'admin',
    provisioning_source: 'manual',
    provisioned_at: null,
    joined_at: '2026-07-23T00:00:00.000Z',
  },
  [`${ORG_B}:org-b-owner`]: {
    organization_id: ORG_B,
    user_id: 'org-b-owner',
    role: 'owner',
    provisioning_source: 'manual',
    provisioned_at: null,
    joined_at: '2026-07-23T00:00:00.000Z',
  },
  [`${ORG_B}:org-b-member`]: {
    organization_id: ORG_B,
    user_id: 'org-b-member',
    role: 'member',
    provisioning_source: 'manual',
    provisioned_at: null,
    joined_at: '2026-07-23T00:00:00.000Z',
  },
};

/**
 * Faithful stand-in for the real table: the SQL's own predicates decide what
 * comes back. If a handler stops binding `organization_id`, this returns the
 * caller's row from ANY organization — which is precisely the cross-tenant
 * read the tests below must catch. Keying off the parameters alone would make
 * the tests pass no matter what the SQL said.
 */
function membershipLookup(sql: string, params?: unknown[]) {
  const text = sql.toLowerCase();
  const scopesOrg = /organization_id\s*=\s*\$1/.test(text);
  const scopesUser = /user_id\s*=\s*\$2/.test(text);
  const [organizationId, userId] = (params ?? []) as [string, string];

  return Object.values(MEMBERSHIPS).filter((row) => {
    if (scopesOrg && row['organization_id'] !== organizationId) return false;
    if (scopesUser && row['user_id'] !== userId) return false;
    return true;
  });
}

function installDatabase() {
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const text = String(sql);
    if (text.includes('pg_advisory_xact_lock')) return [];
    if (text.includes('from public.profiles')) {
      return [
        { id: 'target-user', email: 'target@example.com', display_name: null, avatar_url: null },
      ];
    }
    if (text.includes('left join public.profiles')) {
      // The member LIST. Same rule: the SQL's predicate decides, so dropping
      // `where om.organization_id = $1` leaks every organization's roster.
      const organizationId = (params ?? [])[0];
      const scopesOrg = /om\.organization_id\s*=\s*\$1/i.test(text);
      return Object.values(MEMBERSHIPS).filter(
        (row) => !scopesOrg || row['organization_id'] === organizationId,
      );
    }
    if (text.includes('from public.organization_members')) return membershipLookup(text, params);
    if (text.includes('insert into public.organization_members')) return [];
    return [];
  });
  mockExecute.mockResolvedValue(0);
  mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      query: (...args: unknown[]) => mockQuery(...args),
      execute: (...args: unknown[]) => mockExecute(...args),
    }),
  );
}

describe('settings/team cross-organization isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDatabase();
  });

  it('refuses to list members of an organization the caller does not belong to', async () => {
    const response = await GET(
      new Request(`http://localhost:3000/api/settings/team?organizationId=${ORG_B}`) as never,
    );

    expect(response.status).toBe(403);
    // The member-list query must never have run for ORG_B.
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes('left join public.profiles')),
    ).toBe(false);
  });

  it('binds the member list to the requested organization id', async () => {
    const response = await GET(
      new Request(`http://localhost:3000/api/settings/team?organizationId=${ORG_A}`) as never,
    );

    expect(response.status).toBe(200);
    const listCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('left join public.profiles'),
    );
    expect(String(listCall?.[0])).toContain('where om.organization_id = $1');
    expect(listCall?.[1]).toEqual([ORG_A]);

    const body = (await response.json()) as { members: Array<{ organizationId: string }> };
    expect(body.members).toHaveLength(1);
    expect(body.members.every((m) => m.organizationId === ORG_A)).toBe(true);
  });

  it('refuses to add a member to an organization the caller does not administer', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/settings/team', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId: ORG_B,
          email: 'target@example.com',
          role: 'member',
        }),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);
    expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);
  });

  /**
   * `memberId` is client-supplied and shaped "<orgId>:<userId>". An admin of
   * ORG_A passing a memberId that names ORG_B must be refused BEFORE any row is
   * read or written — otherwise the composite id alone is a cross-tenant write
   * primitive on a BYPASSRLS connection.
   */
  it('refuses to remove a member of another organization via a forged memberId', async () => {
    const memberId = `${ORG_B}:org-b-member`;
    const response = await DELETE(
      new Request(`http://localhost:3000/api/settings/team/${memberId}`, {
        method: 'DELETE',
      }) as never,
      { params: Promise.resolve({ memberId }) },
    );

    expect(response.status).toBe(403);
    expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes('delete from'))).toBe(false);
  });

  it('refuses to change the role of a member of another organization', async () => {
    const memberId = `${ORG_B}:org-b-member`;
    const response = await PATCH(
      new Request(`http://localhost:3000/api/settings/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      }) as never,
      { params: Promise.resolve({ memberId }) },
    );

    expect(response.status).toBe(403);
    expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes('update'))).toBe(false);
  });

  it('carries both the organization id and the user id on every membership mutation', async () => {
    const memberId = `${ORG_A}:target-user`;
    // Make the target a real ORG_A member for this one case.
    MEMBERSHIPS[`${ORG_A}:target-user`] = {
      organization_id: ORG_A,
      user_id: 'target-user',
      role: 'member',
      provisioning_source: 'manual',
      provisioned_at: null,
      joined_at: '2026-07-24T00:00:00.000Z',
    };

    try {
      const response = await DELETE(
        new Request(`http://localhost:3000/api/settings/team/${memberId}`, {
          method: 'DELETE',
        }) as never,
        { params: Promise.resolve({ memberId }) },
      );

      expect(response.status).toBe(200);
      const deleteCall = mockExecute.mock.calls.find(([sql]) =>
        String(sql).includes('delete from public.organization_members'),
      );
      expect(String(deleteCall?.[0])).toContain('organization_id = $1');
      expect(String(deleteCall?.[0])).toContain('user_id = $2');
      expect(deleteCall?.[1]).toEqual([ORG_A, 'target-user']);
    } finally {
      delete MEMBERSHIPS[`${ORG_A}:target-user`];
    }
  });
});
