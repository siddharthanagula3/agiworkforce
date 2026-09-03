import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bypassProfileLookup, rlsScopedProfileLookup } from './rls-profile-lookup.fixture';

vi.mock('server-only', () => ({}));

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
    mockRlsTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockRlsQuery(...args),
        execute: (...args: unknown[]) => mockRlsExecute(...args),
      }),
    );
    mockRlsQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const text = String(sql);
      const profileResult = rlsScopedProfileLookup([], 'owner-user', text, params);
      if (profileResult !== undefined) return profileResult;
      if (text.includes('pg_advisory_xact_lock')) return [];
      if (text.includes('from public.organization_members')) return [ownerMembership];
      return [];
    });
    mockNeonQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const profileResult = bypassProfileLookup([], String(sql), params);
      return profileResult !== undefined ? profileResult : [];
    });
    mockRlsExecute.mockResolvedValue(0);
  });

  it('returns an actionable error and does not pretend an email invitation was queued', async () => {
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
    expect(mockRlsExecute.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(
      false,
    );
    expect(mockRlsQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(
      false,
    );

    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/POST \/api\/settings\/team\/invitations/);
    expect(body.error.message).toMatch(/no email was sent/i);
  });
});
