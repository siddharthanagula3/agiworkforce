import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getUserScopedDb: vi.fn(),
  getTeamAdminAccess: vi.fn(async () => ({ canManageTeam: true })),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  getTeamAdminAccess: mocks.getTeamAdminAccess,
  requireTeamAdminAccess: vi.fn(),
}));

import { hashAdminApiKey } from '../admin-api-keys';
import { resolveComplianceCaller } from '../compliance-caller';

const ORG = '11111111-1111-4111-8111-111111111111';
const KEY = `agiadm_AbCdEf12_${'x'.repeat(43)}`;

function request(token: string) {
  return new Request('https://app.test/api/settings/organization/audit', {
    headers: { Authorization: `Bearer ${token}` },
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTeamAdminAccess.mockResolvedValue({ canManageTeam: true });
});

describe('workspace API key authentication', () => {
  it('authenticates a scoped key against the privileged store without a user session', async () => {
    mocks.query.mockResolvedValue([
      { id: 'key-1', organization_id: ORG, key_hash: hashAdminApiKey(KEY), scopes: ['audit.read'] },
    ]);

    const caller = await resolveComplianceCaller(request(KEY), 'audit.read', 'denied');

    expect(caller).toMatchObject({
      kind: 'admin_api_key',
      organizationId: ORG,
      actorUserId: 'admin_api_key:key-1',
    });
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([hashAdminApiKey(KEY)]);
    expect(String(mocks.query.mock.calls[0]?.[0])).toMatch(/revoked_at is null/);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses a key that is not scoped for the permission asked', async () => {
    mocks.query.mockResolvedValue([
      {
        id: 'key-1',
        organization_id: ORG,
        key_hash: hashAdminApiKey(KEY),
        scopes: ['billing.read'],
      },
    ]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a revoked, expired or unknown key', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses a key for a workspace that lost its team entitlement', async () => {
    mocks.query.mockResolvedValue([
      { id: 'key-1', organization_id: ORG, key_hash: hashAdminApiKey(KEY), scopes: ['audit.read'] },
    ]);
    mocks.getTeamAdminAccess.mockResolvedValue({ canManageTeam: false });

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
