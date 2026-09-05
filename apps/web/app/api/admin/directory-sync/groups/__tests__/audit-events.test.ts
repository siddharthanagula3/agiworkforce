import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

const { mockRecordAuditEvent } = vi.hoisted(() => ({
  mockRecordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: vi.fn(async () => undefined),
  getClientIp: vi.fn(() => '203.0.113.7'),
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

const { mockGetClerkAuthUser } = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(async () => ({ userId: 'owner-user' })),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mockGetClerkAuthUser(...(args as [])),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(async () => ({ plan_tier: 'enterprise', status: 'active' })),
  },
}));

const { getDb } = vi.hoisted(() => ({ getDb: { current: null as unknown } }));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => getDb.current,
}));

import { PATCH } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';

interface Row {
  [key: string]: unknown;
}

function buildDb() {
  const group: Row = {
    id: GROUP,
    connection_id: CONNECTION,
    organization_id: ORG,
    external_id: null,
    display_name: 'Engineering',
    mapped_role: 'member',
    version: 1,
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const query = vi.fn(async (sql: string, params: unknown[] = []): Promise<Row[]> => {
    const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (q.startsWith('select organization_id, role from organization_members')) {
      return [{ organization_id: ORG, role: 'owner' }];
    }
    if (q.startsWith('select id, connection_id, display_name, mapped_role')) {
      return params[0] === group['id'] && params[1] === group['organization_id']
        ? [{ ...group }]
        : [];
    }
    if (q.includes('from scim_group_members m') && q.includes('scim_provisioned_users u')) {
      return [];
    }
    if (q.startsWith('select g.id, g.connection_id, g.external_id')) {
      return [{ ...group }];
    }
    return [];
  });

  const execute = vi.fn(async (sql: string, params: unknown[] = []): Promise<number> => {
    const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (q.startsWith('update scim_groups set mapped_role')) {
      group['mapped_role'] = params[2];
      group['version'] = Number(group['version']) + 1;
      return 1;
    }
    return 0;
  });

  const adapter = {
    query,
    execute,
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(adapter),
  };

  return { adapter, group };
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

const GROUPS_URL = 'https://app.example.com/api/admin/directory-sync/groups';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'owner-user' });
});

describe('scim group role-mapping audit trail', () => {
  it('records scim_group_role_mapping_changed with the previous and new role, and no secret in the payload', async () => {
    const { adapter } = buildDb();
    getDb.current = adapter;

    const response = await PATCH(
      jsonRequest(GROUPS_URL, 'PATCH', {
        groupId: GROUP,
        mappedRole: 'admin',
        organizationId: ORG,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-user',
        eventType: 'scim_group_role_mapping_changed',
        organizationId: ORG,
        severity: 'warning',
        detail: expect.objectContaining({
          resourceType: 'scim_group',
          resourceId: GROUP,
          resourceName: 'Engineering',
          previousRole: 'member',
          role: 'admin',
          count: 0,
        }),
      }),
    );

    const [call] = mockRecordAuditEvent.mock.calls;
    expect(JSON.stringify(call)).not.toMatch(/sk_(live|test)_|whsec_|bearer\s/i);
  });
});
