import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
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
    maxMembers: 3,
    seatsConsumed: 3,
    seatsAvailable: 0,
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

import { POST } from '../route';

const ORG_A = '11111111-1111-4111-8111-111111111111';

const adminMembership = {
  organization_id: ORG_A,
  user_id: 'admin-user',
  role: 'admin',
  provisioning_source: 'manual',
  provisioned_at: null,
  joined_at: '2026-07-23T00:00:00.000Z',
};

const targetProfile = {
  id: 'target-user',
  email: 'target@example.com',
  display_name: 'Target',
  avatar_url: null,
};

function seatCeilingViolation() {
  const error = new Error(
    'new row for relation "organizations" violates check constraint "organizations_seats_within_license"',
  ) as Error & { code?: string; constraint?: string };
  error.code = '23514';
  error.constraint = 'organizations_seats_within_license';
  return error;
}

function request(body: unknown) {
  return new Request('http://localhost:3000/api/settings/team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

function primeHappyPathUntilInsert() {
  mockRlsQuery
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([adminMembership])
    .mockResolvedValueOnce([]);
  mockNeonQuery.mockResolvedValueOnce([targetProfile]);
}

describe('POST /api/settings/team seat ceiling', () => {
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

  it('turns the database seat-ceiling abort into an actionable 409, not a 500', async () => {
    primeHappyPathUntilInsert();
    mockRlsQuery.mockRejectedValueOnce(seatCeilingViolation());

    const response = await POST(
      request({ organizationId: ORG_A, email: 'target@example.com', role: 'member' }),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/no licensed seats available/i);
    expect(body.error.message).toMatch(/removing a member|revoking a pending invitation/i);
  });

  it('lets only one of two concurrent grants against the last seat succeed', async () => {
    const createdRow = {
      ...adminMembership,
      user_id: 'target-user',
      role: 'member',
      email: 'target@example.com',
      display_name: 'Target',
      avatar_url: null,
    };

    let insertsAttempted = 0;
    mockRlsQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      if (text.includes('pg_advisory_xact_lock')) return [];
      if (text.includes('insert into public.organization_members')) {
        insertsAttempted += 1;
        if (insertsAttempted === 1) return [createdRow];
        throw seatCeilingViolation();
      }
      if (text.includes('from public.organization_members')) {
        return params?.[1] === 'admin-user' ? [adminMembership] : [];
      }
      return [];
    });
    mockNeonQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from public.profiles')) return [targetProfile];
      return [];
    });

    const [first, second] = await Promise.all([
      POST(request({ organizationId: ORG_A, email: 'target@example.com', role: 'member' })),
      POST(request({ organizationId: ORG_A, email: 'other@example.com', role: 'member' })),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(insertsAttempted).toBe(2);
  });

  it('does not consume a seat when the target is already a member', async () => {
    mockRlsQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([adminMembership])
      .mockResolvedValueOnce([{ ...adminMembership, user_id: 'target-user', role: 'member' }]);
    mockNeonQuery.mockResolvedValueOnce([targetProfile]);

    const response = await POST(
      request({ organizationId: ORG_A, email: 'target@example.com', role: 'member' }),
    );

    expect(response.status).toBe(409);
    expect(mockRlsQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(
      false,
    );
  });

  it('expires lapsed invitations first, so a dead invitation cannot block a live seat', async () => {
    mockRlsQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([adminMembership])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...adminMembership, user_id: 'target-user' }]);
    mockNeonQuery.mockResolvedValueOnce([targetProfile]);

    await POST(request({ organizationId: ORG_A, email: 'target@example.com', role: 'member' }));

    const expiryCall = mockRlsExecute.mock.calls.find(([sql]) =>
      String(sql).toLowerCase().includes("status = 'expired'"),
    );
    expect(expiryCall).toBeDefined();
    expect(expiryCall?.[1]).toEqual([ORG_A]);
  });
});
