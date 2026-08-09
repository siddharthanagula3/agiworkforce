import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { dbHolder, verifyScimTokenMock, recordSyncEventMock, getSubscriptionMock } = vi.hoisted(
  () => ({
    dbHolder: { current: null as unknown },
    verifyScimTokenMock: vi.fn(),
    recordSyncEventMock: vi.fn(async () => {}),
    getSubscriptionMock: vi.fn(),
  }),
);

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => dbHolder.current,
}));

vi.mock('../scim-token-service', () => ({
  verifyScimToken: (...args: unknown[]) => verifyScimTokenMock(...args),
}));

vi.mock('../scim-provisioning-service', () => ({
  recordSyncEvent: (...args: unknown[]) => recordSyncEventMock(...args),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: (...args: unknown[]) => getSubscriptionMock(...args) },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { authenticateScimRequest } from '../scim-auth';
import { ScimError } from '../scim-protocol';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTION = '33333333-3333-4333-8333-333333333333';
const ISSUER = 'issuer-user';
const RAW_TOKEN = 'scim_0123456789abcdef_'.concat('a'.repeat(48));

type Row = Record<string, unknown>;

/**
 * A database that answers the membership lookup with the row it holds,
 * regardless of any role predicate in the statement text.
 *
 * That is the point of this stub. `organization_members` is keyed on
 * `(organization_id, user_id)`, so the row the route gets back is decided by
 * those two bound parameters alone; whether a non-administering role is
 * refused has to be decided by the route. A stub that re-implemented a
 * `role in ('owner', 'admin')` filter would only be asserting that the test
 * and the query string agree with each other.
 */
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
  getSubscriptionMock.mockResolvedValue({ plan_tier: 'enterprise', status: 'active' });
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
    // The admin role set is a contract shared with the API gateway and the RLS
    // helpers. A literal here would drift from it silently, so pin its absence.
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
