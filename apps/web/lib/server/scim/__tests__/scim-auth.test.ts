import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/services/org-entitlements');

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  dbHolder,
  verifyScimTokenMock,
  recordSyncEventMock,
  organizationPlanMock,
  isTenantLockedDownMock,
} = vi.hoisted(() => ({
  dbHolder: { current: null as unknown },
  verifyScimTokenMock: vi.fn(),
  recordSyncEventMock: vi.fn(async (..._args: unknown[]) => {}),
  organizationPlanMock: vi.fn(),
  isTenantLockedDownMock: vi.fn(async (_organizationId: string | null) => false),
}));

vi.mock('@/lib/feature-flags/tenant-lockdown', () => ({
  isTenantLockedDown: (...args: unknown[]) => isTenantLockedDownMock(...(args as [string | null])),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => dbHolder.current,
}));

vi.mock('../scim-token-service', () => ({
  verifyScimToken: (...args: unknown[]) => verifyScimTokenMock(...args),
}));

vi.mock('../scim-provisioning-service', () => ({
  recordSyncEvent: (...args: unknown[]) => recordSyncEventMock(...args),
}));

vi.mock('@/lib/services/org-entitlements', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  resolveOrganizationEntitlementPlan: (...args: unknown[]) => organizationPlanMock(...args),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { authenticateScimRequest } from '../scim-auth';
import { ScimError } from '../scim-protocol';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '33333333-3333-4333-8333-333333333333';
const ISSUER = 'issuer-user';
const RAW_TOKEN = 'scim_0123456789abcdef_'.concat('a'.repeat(48));

type Row = Record<string, unknown>;

function createDb(membership: Row | null): DatabaseAdapter {
  const query = vi.fn(async (sql: string) => {
    const text = sql.trim().toLowerCase();
    if (text.startsWith('select id, provider, is_active from directory_sync_connections')) {
      return [{ id: CONNECTION, provider: 'okta', is_active: true }];
    }
    if (text.startsWith('select role from organization_members')) {
      return membership ? [membership] : [];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  return { query, execute: vi.fn(async () => 0) } as unknown as DatabaseAdapter;
}

function scimRequest(): Request {
  return new Request('https://app.example.com/api/scim/v2/Users', {
    headers: { authorization: `Bearer ${RAW_TOKEN}` },
  });
}

async function expectScimError(promise: Promise<unknown>): Promise<ScimError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ScimError);
  return error as ScimError;
}

beforeEach(() => {
  verifyScimTokenMock.mockResolvedValue({
    tokenId: 'token-1',
    connectionId: CONNECTION,
    organizationId: ORG,
    createdByUserId: ISSUER,
  });
  organizationPlanMock.mockResolvedValue('enterprise');
  isTenantLockedDownMock.mockResolvedValue(false);
  recordSyncEventMock.mockClear();
});

describe('authenticateScimRequest issuer role gate', () => {
  it.each(['owner', 'admin'] as const)('accepts an issuer who is still %s', async (role) => {
    dbHolder.current = createDb({ role });

    const ctx = await authenticateScimRequest(scimRequest());

    expect(ctx.organizationId).toBe(ORG);
    expect(ctx.plan).toBe('enterprise');
  });

  it.each(['member', 'viewer'] as const)('refuses an issuer demoted to %s', async (role) => {
    dbHolder.current = createDb({ role });

    const error = await expectScimError(authenticateScimRequest(scimRequest()));

    expect(error.status).toBe(403);
    expect(recordSyncEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: ORG }),
      expect.objectContaining({ eventType: 'sync.denied' }),
    );
  });

  it('refuses an issuer whose membership is gone', async () => {
    dbHolder.current = createDb(null);

    const error = await expectScimError(authenticateScimRequest(scimRequest()));

    expect(error.status).toBe(403);
  });

  it('does not decide the role in the SQL it sends', async () => {
    dbHolder.current = createDb({ role: 'owner' });

    await authenticateScimRequest(scimRequest());

    const membershipQuery = (
      dbHolder.current as { query: { mock: { calls: unknown[][] } } }
    ).query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.trim().toLowerCase().startsWith('select role from organization_members'));

    expect(membershipQuery).toBeDefined();
    expect(membershipQuery).not.toMatch(/'owner'/);
    expect(membershipQuery).not.toMatch(/'admin'/);
  });
});

describe('authenticateScimRequest tenant lockdown', () => {
  it('refuses a workspace that is locked down, entitlement and role notwithstanding', async () => {
    dbHolder.current = createDb({ role: 'owner' });
    isTenantLockedDownMock.mockResolvedValue(true);

    const error = await expectScimError(authenticateScimRequest(scimRequest()));

    expect(error.status).toBe(403);
    expect(error.message).toMatch(/locked down/);
    expect(isTenantLockedDownMock).toHaveBeenCalledWith(ORG);
  });

  it('records the refusal against the connection that was turned away', async () => {
    dbHolder.current = createDb({ role: 'admin' });
    isTenantLockedDownMock.mockResolvedValue(true);

    await expectScimError(authenticateScimRequest(scimRequest()));

    expect(recordSyncEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: ORG, connectionId: CONNECTION }),
      expect.objectContaining({ eventType: 'sync.denied' }),
    );
  });

  it('lets the same connection through once the lockdown is lifted', async () => {
    dbHolder.current = createDb({ role: 'owner' });

    await expect(authenticateScimRequest(scimRequest())).resolves.toMatchObject({
      organizationId: ORG,
    });
  });
});

describe('authenticateScimRequest organization entitlement', () => {
  it('asks for the plan of the organization the token belongs to, not the issuer', async () => {
    dbHolder.current = createDb({ role: 'admin' });

    await authenticateScimRequest(scimRequest());

    expect(organizationPlanMock).toHaveBeenCalledWith(ORG);
    expect(organizationPlanMock).not.toHaveBeenCalledWith(ISSUER);
  });

  it('refuses a connection whose organization is not on Enterprise and records why', async () => {
    dbHolder.current = createDb({ role: 'owner' });
    organizationPlanMock.mockResolvedValue('team');

    const error = await expectScimError(authenticateScimRequest(scimRequest()));

    expect(error.status).toBe(403);
    expect(error.message).toBe('Directory sync requires an active Enterprise subscription');
    expect(recordSyncEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: ORG, connectionId: CONNECTION }),
      expect.objectContaining({
        eventType: 'sync.denied',
        error: expect.stringContaining('current plan: team'),
      }),
    );
  });

  it('fails closed to Free when the organization plan cannot be resolved', async () => {
    dbHolder.current = createDb({ role: 'owner' });
    organizationPlanMock.mockRejectedValue(new Error('database unavailable'));

    const error = await expectScimError(authenticateScimRequest(scimRequest()));

    expect(error.status).toBe(403);
    expect(recordSyncEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ error: expect.stringContaining('current plan: free') }),
    );
  });
});
