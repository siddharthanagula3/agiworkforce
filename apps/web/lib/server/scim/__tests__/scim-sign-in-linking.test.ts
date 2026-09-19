import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseAdapterFake } from '@/test/database-adapter-fake';

vi.mock('server-only', () => ({}));

const { reconcileMembership } = vi.hoisted(() => ({
  reconcileMembership: vi.fn(async () => ({ membershipGranted: true })),
}));

vi.mock('../scim-provisioning-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scim-provisioning-service')>()),
  reconcileMembership,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { linkPendingScimUsersAtSignIn } from '../scim-sign-in-linking';

const SCIM_USER_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
const ORGANIZATION_ID = '33333333-3333-4333-8333-333333333333';

function row() {
  return {
    id: SCIM_USER_ID,
    connection_id: CONNECTION_ID,
    organization_id: ORGANIZATION_ID,
    external_id: null,
    user_name: 'ada@example.com',
    email: 'ada@example.com',
    given_name: 'Ada',
    family_name: 'Lovelace',
    display_name: 'Ada Lovelace',
    active: true,
    linked_user_id: null,
    linked_at: null,
    raw_attributes: null,
    version: 1,
    created_at: '2026-09-19T00:00:00.000Z',
    updated_at: '2026-09-19T00:00:00.000Z',
  };
}

describe('linkPendingScimUsersAtSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links an authenticated account only after its organization proves the email domain', async () => {
    const execute = vi.fn(async () => 1);
    const db = createDatabaseAdapterFake({
      query: async <T>(sql: string): Promise<T[]> => {
        if (sql.includes('select id, connection_id, organization_id')) {
          return [row()] as T[];
        }
        if (sql.includes('for update')) return [row()] as T[];
        if (sql.includes('from sso_connections')) return [{ domain: 'example.com' }] as T[];
        return [];
      },
      execute,
    });

    await expect(linkPendingScimUsersAtSignIn(db, 'user_ada', 'ADA@example.com')).resolves.toEqual({
      linked: 1,
      failed: 0,
    });

    expect(execute).toHaveBeenCalledWith(expect.stringContaining('set linked_user_id = $1'), [
      'user_ada',
      SCIM_USER_ID,
      CONNECTION_ID,
      ORGANIZATION_ID,
    ]);
    expect(reconcileMembership).toHaveBeenCalledWith(
      expect.anything(),
      { connectionId: CONNECTION_ID, organizationId: ORGANIZATION_ID },
      expect.objectContaining({ linked_user_id: 'user_ada' }),
    );
  });

  it('does not bind an account when the organization has not verified its domain', async () => {
    const execute = vi.fn(async () => 1);
    const db = createDatabaseAdapterFake({
      query: async <T>(sql: string): Promise<T[]> => {
        if (sql.includes('select id, connection_id, organization_id')) {
          return [row()] as T[];
        }
        if (sql.includes('for update')) return [row()] as T[];
        return [];
      },
      execute,
    });

    await expect(linkPendingScimUsersAtSignIn(db, 'user_ada', 'ada@example.com')).resolves.toEqual({
      linked: 0,
      failed: 0,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(reconcileMembership).not.toHaveBeenCalled();
  });

  it('contains one organization failure without blocking the authenticated session', async () => {
    const db = createDatabaseAdapterFake({
      query: async <T>(sql: string): Promise<T[]> => {
        if (sql.includes('for update')) throw new Error('database unavailable');
        if (sql.includes('select id, connection_id, organization_id')) {
          return [row()] as T[];
        }
        return [];
      },
    });

    await expect(linkPendingScimUsersAtSignIn(db, 'user_ada', 'ada@example.com')).resolves.toEqual({
      linked: 0,
      failed: 1,
    });
  });
});
