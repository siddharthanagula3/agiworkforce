import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bypassProfileLookup, rlsScopedProfileLookup } from './rls-profile-lookup.fixture';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({ value: 'admin' as string | null }));
vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole),
);

const {
  mockRlsQuery,
  mockRlsExecute,
  mockRlsTransaction,
  mockNeonQuery,
  mockNeonExecute,
  mockNeonTransaction,
  mockRequireTeamAccess,
} = vi.hoisted(() => ({
  mockRlsQuery: vi.fn(),
  mockRlsExecute: vi.fn(),
  mockRlsTransaction: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockNeonExecute: vi.fn(),
  mockNeonTransaction: vi.fn(),
  mockRequireTeamAccess: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'attacker-user' })),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: (...args: unknown[]) => mockRequireTeamAccess(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: (...args: unknown[]) => mockNeonExecute(...args),
    transaction: (...args: unknown[]) => mockNeonTransaction(...args),
  })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mockRlsQuery(...args),
      execute: (...args: unknown[]) => mockRlsExecute(...args),
      transaction: (...args: unknown[]) => mockRlsTransaction(...args),
    },
    userId: 'attacker-user',
    organizationId: null,
  })),
}));

import { POST } from '../route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

const VICTIM = {
  id: 'victim-user',
  email: 'victim@corp.example',
  display_name: 'Victim',
  avatar_url: null,
};

const COLLEAGUE = {
  id: 'colleague-user',
  email: 'colleague@owned.example',
  display_name: 'Colleague',
  avatar_url: null,
};

const attackerMembership = {
  organization_id: ORGANIZATION_ID,
  user_id: 'attacker-user',
  role: 'owner',
  provisioning_source: 'manual',
  provisioned_at: null,
  joined_at: '2026-08-01T00:00:00.000Z',
};

function request(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/settings/team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

function insertStatements(): string[] {
  return [...mockRlsQuery.mock.calls, ...mockRlsExecute.mock.calls]
    .map(([sql]) => String(sql))
    .filter((sql) => /insert into public\.organization_members/i.test(sql));
}

/**
 * WEB-SEC-SCAN-2026-09-09-F23. The only authorization this route checked was
 * the CALLER's org-admin role. An email was resolved to any `profiles` row over
 * the RLS-bypassing connection and inserted straight into
 * `organization_members`, so one paid seat let an attacker bind any registered
 * account into their tenant with no consent from that account, and then reach
 * the member-removal path against it.
 */
describe('POST /api/settings/team requires the target account to be the organization’s', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTeamAccess.mockResolvedValue({
      plan: 'team',
      canManageTeam: true,
      maxMembers: null,
    });
    mockRlsTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockRlsQuery(...args),
        execute: (...args: unknown[]) => mockRlsExecute(...args),
      }),
    );
    mockRlsExecute.mockResolvedValue(0);
    mockNeonQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const profiles = bypassProfileLookup([VICTIM, COLLEAGUE], String(sql), params);
      return profiles !== undefined ? profiles : [];
    });
  });

  function stubRls({ verifiedDomains = [] as string[] } = {}) {
    mockRlsQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      const scoped = rlsScopedProfileLookup([], 'attacker-user', text, params);
      if (scoped !== undefined) return scoped;
      if (text.includes('pg_advisory_xact_lock')) return [];
      if (text.includes('from sso_connections')) {
        return verifiedDomains.map((domain) => ({ domain }));
      }
      if (text.includes('from public.organization_members')) {
        const [, userId] = (params ?? []) as [string, string];
        return userId === 'attacker-user' ? [attackerMembership] : [];
      }
      if (text.includes('insert into public.organization_members')) {
        return [
          {
            organization_id: ORGANIZATION_ID,
            user_id: 'colleague-user',
            role: 'member',
            provisioning_source: 'manual',
            provisioned_at: null,
            joined_at: '2026-09-13T00:00:00.000Z',
            email: COLLEAGUE.email,
            display_name: COLLEAGUE.display_name,
            avatar_url: null,
          },
        ];
      }
      return [];
    });
  }

  it('refuses to force-join a registered account on a domain it has not verified', async () => {
    stubRls({ verifiedDomains: ['owned.example'] });

    const response = await POST(
      request({ organizationId: ORGANIZATION_ID, email: VICTIM.email, role: 'viewer' }),
    );

    expect(response.status).toBe(400);
    expect(insertStatements()).toEqual([]);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/verified/i);
    expect(body.error.message).toMatch(/POST \/api\/settings\/team\/invitations/);
  });

  it('answers an address off its verified domains the same whether or not an account uses it', async () => {
    stubRls({ verifiedDomains: ['owned.example'] });

    const registered = await POST(
      request({ organizationId: ORGANIZATION_ID, email: VICTIM.email, role: 'member' }),
    );
    const unregistered = await POST(
      request({ organizationId: ORGANIZATION_ID, email: 'nobody@corp.example', role: 'member' }),
    );

    const errorOf = async (response: Response) =>
      ((await response.json()) as { error: unknown }).error;
    expect(registered.status).toBe(unregistered.status);
    expect(await errorOf(registered)).toEqual(await errorOf(unregistered));
    expect(
      mockNeonQuery.mock.calls.filter(([sql]) => /from\s+public\.profiles/i.test(String(sql))),
    ).toEqual([]);
  });

  it('refuses every direct add when the organization has verified no domain at all', async () => {
    stubRls();

    const response = await POST(
      request({ organizationId: ORGANIZATION_ID, email: COLLEAGUE.email, role: 'member' }),
    );

    expect(response.status).toBe(400);
    expect(insertStatements()).toEqual([]);
  });

  it('still adds an account on a domain the organization has verified', async () => {
    stubRls({ verifiedDomains: ['owned.example'] });

    const response = await POST(
      request({ organizationId: ORGANIZATION_ID, email: COLLEAGUE.email, role: 'member' }),
    );

    expect(response.status).toBe(201);
    expect(insertStatements()).toHaveLength(1);
  });
});
