import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockEntitlements } = vi.hoisted(() => ({ mockEntitlements: vi.fn() }));

vi.mock('@/lib/services/org-entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-entitlements')>()),
  getOrganizationEntitlements: mockEntitlements,
}));

import {
  ORG_SHARED_CONNECTOR_PREFIX,
  listSharedConnectors,
  orgSharedConnectorServerId,
  orgShortIdFromServerId,
  shareConnector,
  unshareConnector,
} from '../org-shared-connector-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTOR = '44444444-4444-4444-8444-444444444444';

interface Issued {
  sql: string;
  params: unknown[];
}

function makeDb(handler: (sql: string, params: unknown[]) => unknown[]) {
  const issued: Issued[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      issued.push({ sql, params });
      return handler(sql, params);
    }),
  };
  return { db: db as never, issued };
}

const SHARED_ROW = {
  organization_id: ORG,
  connector_row_id: CONNECTOR,
  org_short_id: 'a1b2c3d4e5',
  shared_by_user_id: 'admin-1',
  created_at: '2026-01-01T00:00:00.000Z',
  name: 'Jira',
  url: 'https://mcp.example.com/sse',
  transport: 'sse',
  user_id: 'admin-1',
  auth_header_enc: 'ENCRYPTED-SECRET',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEntitlements.mockResolvedValue({
    organizationId: ORG,
    plan: 'team',
    sharedProjectLimit: 25,
    sharedConnectorLimit: 25,
  });
});

describe('org-shared connector namespace', () => {
  it('is distinct from the personal custom- namespace', () => {
    expect(ORG_SHARED_CONNECTOR_PREFIX).toBe('orgmcp-');
    expect(orgSharedConnectorServerId('a1b2c3d4e5')).toBe('orgmcp-a1b2c3d4e5');
    expect(orgSharedConnectorServerId('a1b2c3d4e5')).not.toContain('_');
  });

  it('refuses a personal server id and any malformed short id', () => {
    expect(orgShortIdFromServerId('custom-a1b2c3d4e5')).toBeNull();
    expect(orgShortIdFromServerId('orgmcp-NOTHEX0000')).toBeNull();
    expect(orgShortIdFromServerId('orgmcp-short')).toBeNull();
    expect(orgShortIdFromServerId('orgmcp-a1b2c3d4e5')).toBe('a1b2c3d4e5');
  });
});

describe('listSharedConnectors', () => {
  it('binds the organization and never returns the stored credential', async () => {
    const { db, issued } = makeDb(() => [SHARED_ROW]);

    const shared = await listSharedConnectors(db, ORG);

    expect(issued[0]!.sql).toMatch(/where s\.organization_id = \$1/i);
    expect(issued[0]!.params).toEqual([ORG]);
    expect(issued[0]!.sql).not.toMatch(/auth_header_enc/);

    expect(shared).toHaveLength(1);
    expect(shared[0]).toEqual({
      organizationId: ORG,
      connectorRowId: CONNECTOR,
      orgShortId: 'a1b2c3d4e5',
      name: 'Jira',
      url: 'https://mcp.example.com/sse',
      transport: 'sse',
      ownerUserId: 'admin-1',
      sharedByUserId: 'admin-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(shared)).not.toContain('ENCRYPTED-SECRET');
  });
});

describe('shareConnector', () => {
  it('shares only a connector the ACTOR owns and enforces the ceiling in SQL', async () => {
    const { db, issued } = makeDb((sql) =>
      /select exists/i.test(sql) ? [{ exists: false }] : [SHARED_ROW],
    );

    const shared = await shareConnector(db, {
      organizationId: ORG,
      connectorRowId: CONNECTOR,
      actorUserId: 'admin-1',
    });

    expect(shared.orgShortId).toBe('a1b2c3d4e5');

    const insert = issued.find(({ sql }) =>
      /insert into public\.organization_shared_connectors/i.test(sql),
    );
    expect(insert).toBeDefined();
    expect(insert!.sql).toMatch(
      /from public\.user_custom_connectors\s+where id = \$2\s+and user_id = \$3/i,
    );
    expect(insert!.sql).toMatch(
      /public\.assert_org_resource_limit\('org_shared_connectors', \$1, \$5\)/i,
    );
    expect(insert!.params[0]).toBe(ORG);
    expect(insert!.params[1]).toBe(CONNECTOR);
    expect(insert!.params[2]).toBe('admin-1');
    expect(insert!.params[4]).toBe(25);
  });

  it('allocates the org short id inside the organization, not globally', async () => {
    const { db, issued } = makeDb((sql) =>
      /select exists/i.test(sql) ? [{ exists: false }] : [SHARED_ROW],
    );
    await shareConnector(db, {
      organizationId: ORG,
      connectorRowId: CONNECTOR,
      actorUserId: 'admin-1',
    });
    const probe = issued.find(({ sql }) => /select exists/i.test(sql));
    expect(probe!.sql).toMatch(/where organization_id = \$1\s+and org_short_id = \$2/i);
    expect(probe!.params[0]).toBe(ORG);
    expect(String(probe!.params[1])).toMatch(/^[0-9a-f]{10}$/);
  });

  it('404s when the connector is not the actor’s', async () => {
    const { db } = makeDb((sql) => (/select exists/i.test(sql) ? [{ exists: false }] : []));
    await expect(
      shareConnector(db, {
        organizationId: ORG,
        connectorRowId: CONNECTOR,
        actorUserId: 'not-the-owner',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('maps the org ceiling violation to 409, not 500', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/select exists/i.test(sql)) return [{ exists: false }];
        const error: Error & { code?: string } = new Error('org_resource_limit_reached');
        error.code = 'P0001';
        throw error;
      }),
    } as never;

    await expect(
      shareConnector(db, {
        organizationId: ORG,
        connectorRowId: CONNECTOR,
        actorUserId: 'admin-1',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses before any database work when the org plan includes no shared connectors', async () => {
    mockEntitlements.mockResolvedValue({
      organizationId: ORG,
      plan: 'free',
      sharedProjectLimit: 0,
      sharedConnectorLimit: 0,
    });
    const { db, issued } = makeDb(() => []);
    await expect(
      shareConnector(db, {
        organizationId: ORG,
        connectorRowId: CONNECTOR,
        actorUserId: 'admin-1',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(issued).toHaveLength(0);
  });
});

describe('unshareConnector', () => {
  it('deletes only within the caller’s organization and returns the id to evict', async () => {
    const { db, issued } = makeDb(() => [{ org_short_id: 'a1b2c3d4e5' }]);
    expect(await unshareConnector(db, ORG, CONNECTOR)).toEqual({ orgShortId: 'a1b2c3d4e5' });
    expect(issued[0]!.sql).toMatch(/where organization_id = \$1\s+and connector_row_id = \$2/i);
    expect(issued[0]!.params).toEqual([ORG, CONNECTOR]);
  });

  it('returns null on a miss instead of reporting a successful un-share', async () => {
    const { db } = makeDb(() => []);
    expect(await unshareConnector(db, ORG, CONNECTOR)).toBeNull();
  });
});
