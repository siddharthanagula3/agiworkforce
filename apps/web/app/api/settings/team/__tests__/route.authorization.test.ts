import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockTransaction } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
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
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
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
    mockExecute.mockResolvedValue(0);
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
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
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not a member of the named organization', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await POST(
      request({ organizationId: ORG_A, email: 'someone@example.com', role: 'member' }),
    );

    expect(response.status).toBe(403);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);
  });

  it('refuses a plain member who is not an admin', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([
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
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);
  });

  it('does not read a member count before inserting, because the ceiling is a DB constraint', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          organization_id: ORG_A,
          user_id: 'admin-user',
          role: 'admin',
          provisioning_source: 'manual',
          provisioned_at: null,
          joined_at: '2026-07-23T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'target-user', email: 'someone@example.com', display_name: null, avatar_url: null },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          organization_id: ORG_A,
          user_id: 'target-user',
          role: 'member',
          provisioning_source: 'manual',
          provisioned_at: null,
          joined_at: '2026-08-05T00:00:00.000Z',
          email: 'someone@example.com',
          display_name: null,
          avatar_url: null,
        },
      ]);

    const response = await POST(
      request({ organizationId: ORG_A, email: 'someone@example.com', role: 'member' }),
    );

    expect(response.status).toBe(201);
    const sqls = mockQuery.mock.calls.map(([sql]) => String(sql).toLowerCase());
    expect(
      sqls.some((sql) => sql.includes('count(*)') && sql.includes('organization_members')),
    ).toBe(false);
  });
});

describe('GET /api/settings/team authorization invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a non-UUID organizationId before querying', async () => {
    const response = await GET(listRequest("' or '1'='1"));

    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
