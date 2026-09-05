import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockGetUserScopedDb, mockRequireTeamAdminAccess, mockRecordAuditEvent } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockGetUserScopedDb: vi.fn(),
    mockRequireTeamAdminAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
    mockRecordAuditEvent: vi.fn(async () => undefined),
  }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockRecordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: mockRequireTeamAdminAccess,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  getOperatorMappedConnectorIds: () => new Set(['fixture-alpha', 'fixture-beta']),
}));

import { GET, PUT } from '../route';
import type { ConnectorPolicyResponse } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function row(over: Record<string, unknown> = {}) {
  return {
    organization_id: ORG,
    allowed_connectors: [],
    blocked_connectors: [],
    allow_custom_connectors: true,
    updated_by_user_id: 'user-1',
    updated_at: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

function bind({
  role = 'admin' as 'owner' | 'admin' | 'member' | 'viewer',
  existing = null as Record<string, unknown> | null,
  written = row(),
} = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/from public\.user_settings/i.test(text)) return [{ organization_id: ORG }];
    if (/from public\.organization_members/i.test(text)) return [{ organization_id: ORG, role }];
    if (/insert into public\.organization_connector_policies/i.test(text)) return [written];
    if (/from public\.organization_connector_policies/i.test(text)) {
      return existing ? [existing] : [];
    }
    return [];
  });
}

function req(method: string, body?: unknown): Request {
  return new Request('https://app.test/api/settings/organization/connector-policy', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

const BASE = { allowedConnectors: [], blockedConnectors: [], allowCustomConnectors: true };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
  });
});

describe('connector policy', () => {
  it('serves a plain member, who needs it to know why an integration is missing', async () => {
    bind({ role: 'member' });
    const res = await GET(req('GET') as never);

    expect(res.status).toBe(200);
    expect(((await res.json()) as ConnectorPolicyResponse).canManagePolicy).toBe(false);
  });

  it('refuses a member trying to change it', async () => {
    bind({ role: 'member' });
    expect((await PUT(req('PUT', BASE) as never)).status).toBe(403);
  });

  it('refuses a viewer trying to change it', async () => {
    bind({ role: 'viewer' });
    expect((await PUT(req('PUT', BASE) as never)).status).toBe(403);
  });

  it('distinguishes no policy row from a permissive one', async () => {
    bind({ existing: null });
    expect(
      ((await (await GET(req('GET') as never)).json()) as ConnectorPolicyResponse).configured,
    ).toBe(false);

    bind({ existing: row() });
    expect(
      ((await (await GET(req('GET') as never)).json()) as ConnectorPolicyResponse).configured,
    ).toBe(true);
  });

  it('derives the catalog from the product rather than a list in the route', async () => {
    bind();
    const body = (await (await GET(req('GET') as never)).json()) as ConnectorPolicyResponse;
    expect(body.catalog).toEqual(['fixture-alpha', 'fixture-beta']);
  });

  it('saves a block and records it', async () => {
    bind({ role: 'admin', written: row({ blocked_connectors: ['fixture-alpha'] }) });
    const res = await PUT(req('PUT', { ...BASE, blockedConnectors: ['fixture-alpha'] }) as never);

    expect(res.status).toBe(200);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ resourceType: 'organization_connector_policy' }),
      }),
    );
  });

  it('refuses a connector that is both approved and blocked', async () => {
    bind({ role: 'admin' });
    const res = await PUT(
      req('PUT', {
        ...BASE,
        allowedConnectors: ['fixture-alpha'],
        blockedConnectors: ['fixture-alpha'],
      }) as never,
    );

    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/both approved and blocked/i);
  });

  it('rejects a list beyond the table ceiling instead of failing in the database', async () => {
    bind({ role: 'admin' });
    const tooMany = Array.from({ length: 513 }, (_, i) => `c-${i}`);
    expect((await PUT(req('PUT', { ...BASE, blockedConnectors: tooMany }) as never)).status).toBe(
      400,
    );
  });

  it('checks the plan entitlement before reading anything', async () => {
    bind({ role: 'owner' });
    const { AppError } = await import('@/lib/errors');
    mockRequireTeamAdminAccess.mockRejectedValueOnce(
      new AppError('SUBSCRIPTION_REQUIRED' as never, 'Upgrade required', 403),
    );
    expect((await GET(req('GET') as never)).status).toBe(403);
  });
});
