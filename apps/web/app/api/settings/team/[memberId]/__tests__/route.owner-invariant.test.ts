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

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'owner-user' })),
}));

vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({
    plan: 'team',
    canManageTeam: true,
    maxMembers: null,
  })),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  })),
}));

import { PATCH } from '../route';

const organizationId = '11111111-1111-4111-8111-111111111111';
const ownerRow = {
  organization_id: organizationId,
  user_id: 'owner-user',
  role: 'owner',
  provisioning_source: 'manual',
  provisioned_at: null,
  joined_at: '2026-07-23T00:00:00.000Z',
};

function request(role: string) {
  return new Request(`http://localhost:3000/api/settings/team/${organizationId}:owner-user`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  }) as never;
}

describe('PATCH /api/settings/team/[memberId] owner invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
      }),
    );
  });

  it('does not allow the last owner to demote themselves', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ownerRow])
      .mockResolvedValueOnce([ownerRow])
      .mockResolvedValueOnce([{ owner_count: '1' }]);

    const response = await PATCH(request('admin'), {
      params: Promise.resolve({ memberId: `${organizationId}:owner-user` }),
    });

    expect(response.status).toBe(409);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('allows an owner demotion after another owner exists', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ownerRow])
      .mockResolvedValueOnce([ownerRow])
      .mockResolvedValueOnce([{ owner_count: '2' }]);
    mockExecute.mockResolvedValueOnce(undefined);

    const response = await PATCH(request('admin'), {
      params: Promise.resolve({ memberId: `${organizationId}:owner-user` }),
    });

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('set role = $1'), [
      'admin',
      organizationId,
      'owner-user',
    ]);
  });
});
