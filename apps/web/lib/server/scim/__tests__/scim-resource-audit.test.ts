import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const { mockRecordAuditEvent } = vi.hoisted(() => ({
  mockRecordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
}));

vi.mock('@/lib/server/request-context-cache', () => ({
  invalidateActiveOrganizationCache: vi.fn(async () => undefined),
}));

import {
  createScimGroup,
  createScimUser,
  deleteScimGroup,
  deleteScimUser,
  patchScimGroup,
  patchScimUser,
  type ParsedScimUser,
  type ScimConnectionContext,
} from '../scim-provisioning-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '22222222-2222-4222-8222-222222222222';
const TOKEN = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const GROUP_ID = '66666666-6666-4666-8666-666666666666';
const SECRET = 'this-value-must-never-appear-in-an-audit-event';

const ctx: ScimConnectionContext = {
  connectionId: CONNECTION,
  organizationId: ORG,
  tokenId: TOKEN,
};

interface Row {
  [key: string]: unknown;
}

function fakeDb(seed: { user?: Row; group?: Row } = {}) {
  let userRow: Row | null = seed.user ? { ...seed.user } : null;
  let groupRow: Row | null = seed.group ? { ...seed.group } : null;

  const adapter: DatabaseAdapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (q.startsWith('select lower(domain) as domain from sso_connections')) {
        return [{ domain: 'example.com' }] as unknown as T[];
      }

      if (q.startsWith('insert into scim_provisioned_users')) {
        userRow = {
          id: USER_ID,
          connection_id: params[0],
          organization_id: params[1],
          external_id: params[2],
          user_name: params[3],
          email: params[4],
          given_name: params[5],
          family_name: params[6],
          display_name: params[7],
          active: params[8],
          linked_user_id: null,
          linked_at: null,
          raw_attributes: params[9] ? JSON.parse(String(params[9])) : null,
          version: 1,
        };
        return [{ ...userRow }] as unknown as T[];
      }
      if (
        q.startsWith('update scim_provisioned_users set external_id') ||
        q.startsWith('update scim_provisioned_users set user_name')
      ) {
        userRow = { ...(userRow ?? {}), active: params.at(-1) };
        return [{ ...userRow }] as unknown as T[];
      }
      if (q.includes('from scim_provisioned_users') && q.includes('where id = $1')) {
        return userRow && userRow['id'] === params[0]
          ? ([{ ...userRow }] as unknown as T[])
          : ([] as unknown as T[]);
      }

      if (q.startsWith('insert into scim_groups')) {
        groupRow = {
          id: GROUP_ID,
          connection_id: params[0],
          organization_id: params[1],
          external_id: params[2],
          display_name: params[3],
          mapped_role: null,
          version: 1,
        };
        return [{ ...groupRow }] as unknown as T[];
      }
      if (q.startsWith('update scim_groups set display_name')) {
        groupRow = { ...(groupRow ?? {}), display_name: params[3], external_id: params[4] };
        return [{ ...groupRow }] as unknown as T[];
      }
      if (q.includes('from scim_groups') && q.includes('where id = $1')) {
        return groupRow && groupRow['id'] === params[0]
          ? ([{ ...groupRow }] as unknown as T[])
          : ([] as unknown as T[]);
      }
      if (q.includes('from scim_group_members m') && q.includes('scim_provisioned_users u')) {
        return [] as unknown as T[];
      }

      return [] as unknown as T[];
    },
    async execute(): Promise<number> {
      return 1;
    },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(adapter);
    },
    withUser() {
      return adapter;
    },
  } as unknown as DatabaseAdapter;

  return adapter;
}

function noSecretIn(call: unknown): void {
  expect(JSON.stringify(call)).not.toContain(SECRET);
}

describe('SCIM resource audit trail', () => {
  it('records scim_user_provisioned when the identity provider creates a directory user', async () => {
    const db = fakeDb();
    const input: ParsedScimUser = {
      userName: 'jane@example.com',
      externalId: null,
      email: 'jane@example.com',
      givenName: 'Jane',
      familyName: 'Doe',
      displayName: 'Jane Doe',
      active: true,
    };

    await createScimUser(db, ctx, input, { userName: 'jane@example.com', password: SECRET });

    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        eventType: 'scim_user_provisioned',
        organizationId: ORG,
        severity: 'info',
        detail: expect.objectContaining({
          resourceType: 'scim_provisioned_user',
          resourceId: USER_ID,
          resourceName: 'jane@example.com',
          source: 'scim',
          subjectRef: `scim_token:${TOKEN}`,
        }),
      }),
    );
    noSecretIn(mockRecordAuditEvent.mock.calls[0]);
  });

  it('records scim_user_updated at warning severity when a patch deactivates the user', async () => {
    const db = fakeDb({
      user: {
        id: USER_ID,
        connection_id: CONNECTION,
        organization_id: ORG,
        external_id: null,
        user_name: 'jane@example.com',
        email: 'jane@example.com',
        given_name: 'Jane',
        family_name: 'Doe',
        display_name: 'Jane Doe',
        active: true,
        linked_user_id: null,
        version: 1,
      },
    });

    await patchScimUser(db, ctx, USER_ID, [{ op: 'replace', path: 'active', value: false }]);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_user_updated',
        organizationId: ORG,
        severity: 'warning',
        detail: expect.objectContaining({
          resourceType: 'scim_provisioned_user',
          resourceId: USER_ID,
          status: 'inactive',
        }),
      }),
    );
    noSecretIn(mockRecordAuditEvent.mock.calls.at(-1));
  });

  it('records scim_user_deprovisioned when the identity provider deletes a directory user', async () => {
    const db = fakeDb({
      user: {
        id: USER_ID,
        connection_id: CONNECTION,
        organization_id: ORG,
        external_id: null,
        user_name: 'jane@example.com',
        email: 'jane@example.com',
        active: true,
        linked_user_id: null,
        version: 1,
      },
    });

    await deleteScimUser(db, ctx, USER_ID);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_user_deprovisioned',
        organizationId: ORG,
        severity: 'warning',
        detail: expect.objectContaining({
          resourceType: 'scim_provisioned_user',
          resourceId: USER_ID,
          resourceName: 'jane@example.com',
          subjectRef: `scim_token:${TOKEN}`,
        }),
      }),
    );
    noSecretIn(mockRecordAuditEvent.mock.calls.at(-1));
  });

  it('records scim_group_provisioned when the identity provider creates a directory group', async () => {
    const db = fakeDb();

    await createScimGroup(db, ctx, {
      displayName: 'Engineering',
      externalId: null,
      memberIds: [],
    });

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_group_provisioned',
        organizationId: ORG,
        severity: 'info',
        detail: expect.objectContaining({
          resourceType: 'scim_group',
          resourceId: GROUP_ID,
          resourceName: 'Engineering',
        }),
      }),
    );
    noSecretIn(mockRecordAuditEvent.mock.calls.at(-1));
  });

  it('records scim_group_updated when the identity provider renames a directory group', async () => {
    const db = fakeDb({
      group: {
        id: GROUP_ID,
        connection_id: CONNECTION,
        organization_id: ORG,
        external_id: null,
        display_name: 'Engineering',
        mapped_role: null,
        version: 1,
      },
    });

    await patchScimGroup(db, ctx, GROUP_ID, [
      { op: 'replace', path: 'displayName', value: 'Platform Engineering' },
    ]);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_group_updated',
        organizationId: ORG,
        severity: 'info',
        detail: expect.objectContaining({
          resourceType: 'scim_group',
          resourceId: GROUP_ID,
          resourceName: 'Platform Engineering',
        }),
      }),
    );
    noSecretIn(mockRecordAuditEvent.mock.calls.at(-1));
  });

  it('records scim_group_deprovisioned when the identity provider deletes a directory group', async () => {
    const db = fakeDb({
      group: {
        id: GROUP_ID,
        connection_id: CONNECTION,
        organization_id: ORG,
        external_id: null,
        display_name: 'Engineering',
        mapped_role: null,
        version: 1,
      },
    });

    await deleteScimGroup(db, ctx, GROUP_ID);

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'scim_group_deprovisioned',
        organizationId: ORG,
        severity: 'warning',
        detail: expect.objectContaining({
          resourceType: 'scim_group',
          resourceId: GROUP_ID,
          resourceName: 'Engineering',
        }),
      }),
    );
    noSecretIn(mockRecordAuditEvent.mock.calls.at(-1));
  });
});
