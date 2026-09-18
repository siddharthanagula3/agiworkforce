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
const PRINCIPAL = '33333333-3333-4333-8333-333333333333';
const KEY = `agiadm_AbCdEf12_${'x'.repeat(43)}`;

function keyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    organization_id: ORG,
    key_hash: hashAdminApiKey(KEY),
    scopes: ['audit.read'],
    service_principal_id: PRINCIPAL,
    principal_name: 'SIEM exporter',
    principal_max_scopes: ['audit.read'],
    principal_disabled_at: null,
    ...over,
  };
}

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
  it('authenticates a scoped key as a service principal without a user session', async () => {
    mocks.query.mockResolvedValue([keyRow()]);

    const caller = await resolveComplianceCaller(request(KEY), 'audit.read', 'denied');

    expect(caller).toMatchObject({
      kind: 'service_principal',
      organizationId: ORG,
      actorUserId: `service_principal:${PRINCIPAL}`,
      servicePrincipalId: PRINCIPAL,
      keyId: 'key-1',
      role: 'service_principal',
    });
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([hashAdminApiKey(KEY)]);
    expect(String(mocks.query.mock.calls[0]?.[0])).toMatch(/revoked_at is null/);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses a key that is not scoped for the permission asked', async () => {
    mocks.query.mockResolvedValue([
      keyRow({ scopes: ['billing.read'], principal_max_scopes: ['billing.read'] }),
    ]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a scope the principal no longer allows, even when the key still carries it', async () => {
    mocks.query.mockResolvedValue([
      keyRow({ scopes: ['audit.read'], principal_max_scopes: ['billing.read'] }),
    ]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses every key issued to a disabled principal', async () => {
    mocks.query.mockResolvedValue([keyRow({ principal_disabled_at: '2026-09-18T00:00:00.000Z' })]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses a revoked, expired or unknown key', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('never falls back to the interactive cookie when a bearer token is presented', async () => {
    mocks.query.mockResolvedValue([]);

    await expect(
      resolveComplianceCaller(request('not-a-workspace-key'), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses a key for a workspace that lost its team entitlement', async () => {
    mocks.query.mockResolvedValue([keyRow()]);
    mocks.getTeamAdminAccess.mockResolvedValue({ canManageTeam: false });

    await expect(
      resolveComplianceCaller(request(KEY), 'audit.read', 'denied'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
