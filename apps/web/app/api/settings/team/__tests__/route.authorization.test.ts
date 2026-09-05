import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bypassProfileLookup,
  rlsScopedProfileLookup,
  type ProfileFixtureRow,
} from './rls-profile-lookup.fixture';

vi.mock('server-only', () => ({}));

const {
  mockRlsQuery,
  mockRlsExecute,
  mockRlsTransaction,
  mockNeonQuery,
  mockNeonExecute,
  mockNeonTransaction,
} = vi.hoisted(() => ({
  mockRlsQuery: vi.fn(),
  mockRlsExecute: vi.fn(),
  mockRlsTransaction: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockNeonExecute: vi.fn(),
  mockNeonTransaction: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'admin-user' })),
}));

vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({
    plan: 'team',
    canManageTeam: true,
    maxMembers: 10,
    seatsConsumed: 3,
    seatsAvailable: 7,
    seatSource: 'billing',
  })),
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
    userId: 'admin-user',
    organizationId: null,
  })),
}));

import { GET, POST } from '../route';

const ORG_A = '11111111-1111-4111-8111-111111111111';

function listRequest(organizationId: string) {
  return new Request(
    `http://localhost:3000/api/settings/team?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'GET' },
  ) as never;
}

function request(body: unknown) {
  return new Request('http://localhost:3000/api/settings/team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/settings/team authorization invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRlsExecute.mockResolvedValue(0);
    mockRlsTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockRlsQuery(...args),
        execute: (...args: unknown[]) => mockRlsExecute(...args),
      }),
    );
  });

  it('refuses to create an owner through the add-member route, whoever is asking', async () => {
    const response = await POST(
      request({
        organizationId: ORG_A,
        email: 'future-owner@example.com',
        role: 'owner',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockRlsTransaction).not.toHaveBeenCalled();
    expect(mockRlsQuery).not.toHaveBeenCalled();
    expect(mockRlsExecute).not.toHaveBeenCalled();
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not a member of the named organization', async () => {
    mockRlsQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await POST(
      request({ organizationId: ORG_A, email: 'someone@example.com', role: 'member' }),
    );

    expect(response.status).toBe(403);
    expect(mockRlsQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(
      false,
    );
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('refuses a plain member who is not an admin', async () => {
    mockRlsQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        organization_id: ORG_A,
        user_id: 'admin-user',
        role: 'member',
        provisioning_source: 'manual',
        provisioned_at: null,
        joined_at: '2026-07-23T00:00:00.000Z',
      },
    ]);

    const response = await POST(
      request({ organizationId: ORG_A, email: 'someone@example.com', role: 'member' }),
    );

    expect(response.status).toBe(403);
    expect(mockRlsQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(
      false,
    );
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });

  it('does not read a member count before inserting, because the ceiling is a DB constraint', async () => {
    const adminMembership = {
      organization_id: ORG_A,
      user_id: 'admin-user',
      role: 'admin',
      provisioning_source: 'manual',
      provisioned_at: null,
      joined_at: '2026-07-23T00:00:00.000Z',
    };
    const insertedMembership = {
      organization_id: ORG_A,
      user_id: 'target-user',
      role: 'member',
      provisioning_source: 'manual',
      provisioned_at: null,
      joined_at: '2026-08-05T00:00:00.000Z',
      email: 'someone@example.com',
      display_name: null,
      avatar_url: null,
    };
    const profiles: ProfileFixtureRow[] = [
      { id: 'target-user', email: 'someone@example.com', display_name: null, avatar_url: null },
    ];

    mockRlsQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      const profileResult = rlsScopedProfileLookup(profiles, 'admin-user', text, params);
      if (profileResult !== undefined) return profileResult;
      if (text.includes('pg_advisory_xact_lock')) return [];
      if (text.includes('insert into public.organization_members')) return [insertedMembership];
      if (text.includes('from public.organization_members')) {
        return (params as unknown[] | undefined)?.[1] === 'admin-user' ? [adminMembership] : [];
      }
      return [];
    });
    mockNeonQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const profileResult = bypassProfileLookup(profiles, String(sql), params);
      return profileResult !== undefined ? profileResult : [];
    });

    const response = await POST(
      request({ organizationId: ORG_A, email: 'someone@example.com', role: 'member' }),
    );

    expect(response.status).toBe(201);
    const rlsSqls = mockRlsQuery.mock.calls.map(([sql]) => String(sql).toLowerCase());
    expect(
      rlsSqls.some((sql) => sql.includes('count(*)') && sql.includes('organization_members')),
    ).toBe(false);
    expect(rlsSqls.some((sql) => sql.includes('from public.profiles'))).toBe(false);
    expect(
      mockNeonQuery.mock.calls.some(([sql]) => String(sql).includes('from public.profiles')),
    ).toBe(true);
  });
});

describe('GET /api/settings/team authorization invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a non-UUID organizationId before querying', async () => {
    const response = await GET(listRequest("' or '1'='1"));

    expect(response.status).toBe(400);
    expect(mockNeonQuery).not.toHaveBeenCalled();
  });
});
