/**
 * CROSS-ORG ISOLATION — the test that must fail if scoping is removed.
 *
 * There is no live Postgres, pglite, or pg-mem anywhere in this repo, so an
 * isolation test cannot be a database test. Asserting that a service "returned
 * []" for a foreign org would be vacuous: the mock would have returned [] no
 * matter what the route did.
 *
 * So this test asserts the two things that actually constitute the boundary:
 *
 *   1. WHERE the organization id comes from. Every statement the sharing
 *      surface issues must bind the org id that the DATABASE returned for the
 *      authenticated subject — never a value from the URL, the body, or a
 *      header. The tests below send an attacker-controlled org id on the wire
 *      and assert it never appears in a single bound parameter.
 *
 *   2. THAT every statement carries the predicate. Each SQL string is checked
 *      for `organization_id = $n` with the caller's real org bound at that
 *      position. Delete the predicate from the service and these go red.
 *
 * Both are mutation-detecting: removing `where s.organization_id = $1` from
 * org-sharing-service.ts, or swapping `membership.organizationId` for a
 * request-supplied value in the route, fails this file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetUserScopedDb } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetUserScopedDb: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));

// The org's plan is resolved from its owner's subscription over the privileged
// control-plane connection (see lib/services/org-entitlements.ts). That lookup
// is not what this file is testing, so it is stubbed to a provisioned Team org;
// the real quota behaviour is covered in org-sharing-service.test.ts.
vi.mock('@/lib/services/org-entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-entitlements')>()),
  getOrganizationEntitlements: vi.fn(async (organizationId: string) => ({
    organizationId,
    plan: 'team' as const,
    sharedProjectLimit: 25,
    sharedConnectorLimit: 25,
  })),
}));

import { GET } from '../route';
import { DELETE as UNSHARE_PROJECT, PUT as SHARE_PROJECT } from '../projects/[projectId]/route';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const PROJECT_IN_ORG_B = '33333333-3333-4333-8333-333333333333';

/** A member of org A. Their membership row is the ONLY source of org scope. */
function bindCallerInOrgA(role: 'owner' | 'admin' | 'member' = 'admin'): void {
  mockQuery.mockImplementation(async (sql: string) => {
    // Two statements: the active organization is derived from the caller's own
    // user_settings row first, then the role is read for that pair. Answering
    // only the old single query left membership null and turned every
    // assertion into a 403.
    if (/from public\.user_settings/i.test(sql) && /where s\.user_id = \$1/i.test(sql)) {
      return [{ organization_id: ORG_A }];
    }
    if (
      /from public\.organization_members/i.test(sql) &&
      /where organization_id = \$1 and user_id = \$2/i.test(sql)
    ) {
      return [{ organization_id: ORG_A, role }];
    }
    return [];
  });
}

function calls(): { sql: string; params: unknown[] }[] {
  return mockQuery.mock.calls.map((call) => ({
    sql: String(call[0]),
    params: (call[1] ?? []) as unknown[],
  }));
}

describe('organization shared surface · cross-org isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: (...args: unknown[]) => mockQuery(...args) },
      userId: 'user-in-org-a',
      organizationId: null,
    });
  });

  it('GET never binds a client-supplied organization id, only the membership one', async () => {
    bindCallerInOrgA('admin');

    // The attacker names org B every way the wire allows.
    const request = new Request(
      `http://localhost:3000/api/settings/organization/shared?organizationId=${ORG_B}`,
      { headers: { 'x-agi-organization-id': ORG_B } },
    ) as never;

    const response = await GET(request);
    expect(response.status).toBe(200);

    const issued = calls();
    expect(issued.length).toBeGreaterThan(1);

    for (const { params } of issued) {
      expect(params).not.toContain(ORG_B);
    }

    // And the org-scoped reads bind org A, resolved from the membership row.
    const scoped = issued.filter(({ sql }) =>
      /organization_shared_projects|organization_shared_connectors|organization_project_access/i.test(
        sql,
      ),
    );
    expect(scoped.length).toBeGreaterThan(0);
    for (const { sql, params } of scoped) {
      expect(sql).toMatch(/organization_id = \$1/i);
      expect(params[0]).toBe(ORG_A);
    }
  });

  it('the member roster read is fenced on the caller’s organization', async () => {
    bindCallerInOrgA('member');

    const response = await GET(
      new Request('http://localhost:3000/api/settings/organization/shared') as never,
    );
    expect(response.status).toBe(200);

    const roster = calls().find(({ sql }) => /select user_id, role, joined_at/i.test(sql));
    expect(roster).toBeDefined();
    expect(roster!.sql).toMatch(/where organization_id = \$1/i);
    expect(roster!.params).toEqual([ORG_A]);
  });

  it('an admin of org A cannot share a project that lives in org B', async () => {
    bindCallerInOrgA('admin');

    const response = await SHARE_PROJECT(
      new Request(
        `http://localhost:3000/api/settings/organization/shared/projects/${PROJECT_IN_ORG_B}`,
        { method: 'PUT', headers: { 'x-agi-organization-id': ORG_B }, body: '{}' },
      ) as never,
      { params: Promise.resolve({ projectId: PROJECT_IN_ORG_B }) },
    ).catch((error: unknown) => error as { statusCode?: number; status?: number });

    // The share INSERT selects the project by (id, user_id) inside org A, so it
    // matches nothing and the route answers 404 — never a silent success.
    const status =
      (response as { statusCode?: number; status?: number }).statusCode ??
      (response as { status?: number }).status;
    expect(status).toBe(404);

    const insert = calls().find(({ sql }) =>
      /insert into public\.organization_shared_projects/i.test(sql),
    );
    expect(insert).toBeDefined();
    // Org A is bound; org B never reaches the database.
    expect(insert!.params[0]).toBe(ORG_A);
    expect(insert!.params).not.toContain(ORG_B);
    // Ownership predicate: the project must belong to the ACTOR.
    expect(insert!.sql).toMatch(/from public\.user_projects\s+where id = \$2\s+and user_id = \$3/i);
  });

  it('un-share is fenced on the caller’s organization, so org B’s share survives', async () => {
    bindCallerInOrgA('owner');

    await UNSHARE_PROJECT(
      new Request(
        `http://localhost:3000/api/settings/organization/shared/projects/${PROJECT_IN_ORG_B}`,
        { method: 'DELETE' },
      ) as never,
      { params: Promise.resolve({ projectId: PROJECT_IN_ORG_B }) },
    ).catch(() => undefined);

    const del = calls().find(({ sql }) =>
      /delete from public\.organization_shared_projects/i.test(sql),
    );
    expect(del).toBeDefined();
    expect(del!.sql).toMatch(/where organization_id = \$1\s+and project_id = \$2/i);
    expect(del!.params).toEqual([ORG_A, PROJECT_IN_ORG_B]);
  });

  it('a caller with no membership gets 403, not an unscoped read', async () => {
    mockQuery.mockResolvedValue([]);

    const error = (await GET(
      new Request('http://localhost:3000/api/settings/organization/shared') as never,
    ).catch((e: unknown) => e)) as { statusCode?: number; status?: number };

    expect(error.statusCode ?? error.status).toBe(403);
    // Exactly one statement ran: the membership lookup that failed closed.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('a plain member cannot mutate the share set', async () => {
    bindCallerInOrgA('member');

    const error = (await SHARE_PROJECT(
      new Request(
        `http://localhost:3000/api/settings/organization/shared/projects/${PROJECT_IN_ORG_B}`,
        { method: 'PUT', body: '{}' },
      ) as never,
      { params: Promise.resolve({ projectId: PROJECT_IN_ORG_B }) },
    ).catch((e: unknown) => e)) as { statusCode?: number; status?: number };

    expect(error.statusCode ?? error.status).toBe(403);
    const insert = calls().find(({ sql }) => /insert into/i.test(sql));
    expect(insert).toBeUndefined();
  });
});
