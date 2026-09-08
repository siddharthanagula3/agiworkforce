import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockDeprovisionMember, mockInvalidateActiveOrganizationCache } = vi.hoisted(() => ({
  mockDeprovisionMember: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  mockInvalidateActiveOrganizationCache: vi.fn<(...args: unknown[]) => Promise<void>>(
    async () => undefined,
  ),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/services/deprovision-service', () => ({
  deprovisionMember: (...args: unknown[]) => mockDeprovisionMember(...args),
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  invalidateActiveOrganizationCache: (...args: unknown[]) =>
    mockInvalidateActiveOrganizationCache(...args),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createFakeScimDb } from '@/app/api/scim/v2/__tests__/fake-scim-db';
import {
  DIRECTORY_SYNC_CREDENTIAL_REVOCATION_CEILING,
  revokeDirectorySyncGrants,
} from '../directory-sync-revocation';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

interface Recorded {
  sql: string;
  params: unknown[];
}

function fakeDb(options: { revoked?: string[]; retainedOwners?: number; onDelete?: () => never }): {
  db: DatabaseAdapter;
  queries: Recorded[];
} {
  const queries: Recorded[] = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('delete from public.organization_members')) {
        options.onDelete?.();
        return (options.revoked ?? []).map((userId) => ({ user_id: userId }));
      }
      if (sql.includes("role = 'owner'")) {
        return [{ count: String(options.retainedOwners ?? 0) }];
      }
      return [];
    },
    execute: async () => 0,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  } as unknown as DatabaseAdapter;
  return { db, queries };
}

function deprovisionResult(errors: string[] = []) {
  return {
    sessionsRevoked: 1,
    sessionsFailed: 0,
    deviceTokensRevoked: 0,
    apiKeysRevoked: 0,
    sharedConnectorsUnshared: 0,
    errors,
  };
}

describe('revokeDirectorySyncGrants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeprovisionMember.mockResolvedValue(deprovisionResult());
  });

  it('revokes the memberships the deleted connection granted', async () => {
    const { db, queries } = fakeDb({ revoked: ['user-a', 'user-b'] });

    const result = await revokeDirectorySyncGrants(db, {} as never, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    expect(result.membershipsRevoked).toBe(2);
    const del = queries.find((q) => q.sql.includes('delete from public.organization_members'));
    expect(del).toBeDefined();
    expect(del?.params).toEqual([ORGANIZATION_ID, CONNECTION_ID]);
  });

  it('never revokes a membership another live connection still grants', async () => {
    const { db, queries } = fakeDb({ revoked: [] });

    await revokeDirectorySyncGrants(db, {} as never, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    const del = queries.find((q) => q.sql.includes('delete from public.organization_members'));
    expect(del?.sql).toMatch(/not exists/i);
    expect(del?.sql).toMatch(/connection_id <> \$2/);
  });

  it('never revokes a manually added member or an owner', async () => {
    const { db, queries } = fakeDb({ revoked: [] });

    await revokeDirectorySyncGrants(db, {} as never, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    const del = queries.find((q) => q.sql.includes('delete from public.organization_members'));
    expect(del?.sql).toMatch(/provisioning_source = 'scim'/);
    expect(del?.sql).toMatch(/role <> 'owner'/);
  });

  it('deprovisions the credentials of every member it revoked', async () => {
    const { db } = fakeDb({ revoked: ['user-a', 'user-b'] });

    const result = await revokeDirectorySyncGrants(db, {} as never, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    expect(mockDeprovisionMember).toHaveBeenCalledTimes(2);
    expect(mockDeprovisionMember).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      userId: 'user-a',
      organizationId: ORGANIZATION_ID,
    });
    expect(result.membersDeprovisioned).toBe(2);
  });

  it('drops the cached active organization for every revoked member', async () => {
    const { db } = fakeDb({ revoked: ['user-a', 'user-b'] });

    await revokeDirectorySyncGrants(db, {} as never, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    expect(mockInvalidateActiveOrganizationCache).toHaveBeenCalledWith('user-a');
    expect(mockInvalidateActiveOrganizationCache).toHaveBeenCalledWith('user-b');
  });

  it('carries a failed revocation into the result instead of throwing it away', async () => {
    const { db } = fakeDb({ revoked: ['user-a'] });
    mockDeprovisionMember.mockResolvedValue(deprovisionResult(['sessions could not be listed']));

    const result = await revokeDirectorySyncGrants(db, {} as never, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    expect(result.errors).toContain('user-a: sessions could not be listed');
  });

  it('keeps going when one member deprovision throws', async () => {
    const { db } = fakeDb({ revoked: ['user-a', 'user-b'] });
    mockDeprovisionMember
      .mockRejectedValueOnce(new Error('clerk unreachable'))
      .mockResolvedValueOnce(deprovisionResult());

    const result = await revokeDirectorySyncGrants(db, {} as never, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    expect(result.membersDeprovisioned).toBe(1);
    expect(result.errors.some((message) => message.includes('clerk unreachable'))).toBe(true);
  });

  it('stops credential revocation at the ceiling and says how many it left', async () => {
    const revoked = Array.from(
      { length: DIRECTORY_SYNC_CREDENTIAL_REVOCATION_CEILING + 3 },
      (_, index) => `user-${index}`,
    );
    const { db } = fakeDb({ revoked });

    const result = await revokeDirectorySyncGrants(db, {} as never, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    expect(result.membershipsRevoked).toBe(revoked.length);
    expect(mockDeprovisionMember).toHaveBeenCalledTimes(
      DIRECTORY_SYNC_CREDENTIAL_REVOCATION_CEILING,
    );
    expect(result.credentialsNotRevoked).toBe(3);
    expect(result.errors.some((message) => message.includes('3'))).toBe(true);
  });

  it('reports the owners it deliberately kept', async () => {
    const { db } = fakeDb({ revoked: ['user-a'], retainedOwners: 2 });

    const result = await revokeDirectorySyncGrants(db, {} as never, {
      organizationId: ORGANIZATION_ID,
      connectionId: CONNECTION_ID,
    });

    expect(result.ownersRetained).toBe(2);
  });

  it('surfaces a failed membership delete rather than reporting a clean revocation', async () => {
    const { db } = fakeDb({
      onDelete: () => {
        throw new Error('deadlock detected');
      },
    });

    await expect(
      revokeDirectorySyncGrants(db, {} as never, {
        organizationId: ORGANIZATION_ID,
        connectionId: CONNECTION_ID,
      }),
    ).rejects.toThrow('deadlock detected');
    expect(mockDeprovisionMember).not.toHaveBeenCalled();
  });
});

const OTHER_CONNECTION_ID = '44444444-4444-4444-8444-444444444444';

function member(userId: string, role: string, provisioningSource: string | null) {
  return {
    organization_id: ORGANIZATION_ID,
    user_id: userId,
    role,
    provisioning_source: provisioningSource,
    provisioned_at: null,
    joined_at: '2026-01-01T00:00:00.000Z',
  };
}

function provisionedUser(id: string, connectionId: string, linkedUserId: string, active = true) {
  return {
    id,
    connection_id: connectionId,
    organization_id: ORGANIZATION_ID,
    external_id: null,
    user_name: `${linkedUserId}@example.com`,
    email: `${linkedUserId}@example.com`,
    given_name: null,
    family_name: null,
    display_name: null,
    active,
    linked_user_id: linkedUserId,
    linked_at: '2026-01-01T00:00:00.000Z',
    raw_attributes: null,
    version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('revokeDirectorySyncGrants against the shared SCIM fixture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeprovisionMember.mockResolvedValue(deprovisionResult());
  });

  it('removes only the seats this connection granted', async () => {
    const { adapter, state } = createFakeScimDb({
      directory_sync_connections: [
        {
          id: CONNECTION_ID,
          organization_id: ORGANIZATION_ID,
          provider: 'okta',
          directory_id: 'dir-1',
          display_name: 'Okta',
          is_active: true,
          last_sync_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: OTHER_CONNECTION_ID,
          organization_id: ORGANIZATION_ID,
          provider: 'azure_ad',
          directory_id: 'dir-2',
          display_name: 'Entra ID',
          is_active: true,
          last_sync_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      scim_provisioned_users: [
        provisionedUser('u-1', CONNECTION_ID, 'scim-only'),
        provisionedUser('u-2', CONNECTION_ID, 'scim-owner'),
        provisionedUser('u-3', CONNECTION_ID, 'manual-member'),
        provisionedUser('u-4', CONNECTION_ID, 'dual-connection'),
        provisionedUser('u-5', OTHER_CONNECTION_ID, 'dual-connection'),
      ],
      organization_members: [
        member('scim-only', 'member', 'scim'),
        member('scim-owner', 'owner', 'scim'),
        member('manual-member', 'member', 'manual'),
        member('dual-connection', 'member', 'scim'),
        member('unrelated', 'member', 'scim'),
      ],
    });

    const result = await revokeDirectorySyncGrants(
      adapter as unknown as DatabaseAdapter,
      {} as never,
      { organizationId: ORGANIZATION_ID, connectionId: CONNECTION_ID },
    );

    expect(result.membershipsRevoked).toBe(1);
    expect(result.ownersRetained).toBe(1);
    expect(state.organization_members.map((row) => row['user_id']).sort()).toEqual([
      'dual-connection',
      'manual-member',
      'scim-owner',
      'unrelated',
    ]);
  });

  it('revokes a seat whose other connection is switched off', async () => {
    const { adapter, state } = createFakeScimDb({
      directory_sync_connections: [
        {
          id: CONNECTION_ID,
          organization_id: ORGANIZATION_ID,
          provider: 'okta',
          directory_id: 'dir-1',
          display_name: 'Okta',
          is_active: true,
          last_sync_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: OTHER_CONNECTION_ID,
          organization_id: ORGANIZATION_ID,
          provider: 'azure_ad',
          directory_id: 'dir-2',
          display_name: 'Entra ID',
          is_active: false,
          last_sync_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      scim_provisioned_users: [
        provisionedUser('u-1', CONNECTION_ID, 'dual-connection'),
        provisionedUser('u-2', OTHER_CONNECTION_ID, 'dual-connection'),
      ],
      organization_members: [member('dual-connection', 'member', 'scim')],
    });

    const result = await revokeDirectorySyncGrants(
      adapter as unknown as DatabaseAdapter,
      {} as never,
      { organizationId: ORGANIZATION_ID, connectionId: CONNECTION_ID },
    );

    expect(result.membershipsRevoked).toBe(1);
    expect(state.organization_members).toHaveLength(0);
  });
});
