import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockTransaction, mockRequireTeamAccess } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
  mockRequireTeamAccess: vi.fn(),
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

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'owner-user' })),
}));

vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: (...args: unknown[]) => mockRequireTeamAccess(...args),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  })),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mockQuery(...args),
      execute: (...args: unknown[]) => mockExecute(...args),
      transaction: (...args: unknown[]) => mockTransaction(...args),
    },
    userId: 'owner-user',
    organizationId: null,
  })),
}));

import { POST } from '../route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const ownerMembership = {
  organization_id: organizationId,
  user_id: 'owner-user',
  role: 'owner',
  provisioning_source: 'manual',
  provisioned_at: null,
  joined_at: '2026-07-25T00:00:00.000Z',
};

describe('POST /api/settings/team unknown account honesty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTeamAccess.mockResolvedValue({
      plan: 'team',
      canManageTeam: true,
      maxMembers: null,
    });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
      }),
    );
  });

  it('returns an actionable error and does not pretend an email invitation was queued', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ownerMembership])
      .mockResolvedValueOnce([]);

    const response = await POST(
      new Request('http://localhost:3000/api/settings/team', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          email: 'unknown@example.com',
          role: 'member',
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(mockExecute.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);

    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/POST \/api\/settings\/team\/invitations/);
    expect(body.error.message).toMatch(/no email was sent/i);
  });
});
