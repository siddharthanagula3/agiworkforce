import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  MAX_SUPPORT_ACCESS_TTL_MS,
  SupportAccessDeniedError,
  SupportAccessRequestError,
  approveSupportAccess,
  assertSupportAccess,
  expireStaleSupportAccessGrants,
  findLiveSupportAccessGrant,
  listSupportAccessEvents,
  requestSupportAccess,
  revokeSupportAccess,
  verifySupportAccessTrail,
  withSupportAccess,
  type SupportAccessStatus,
} from './support-access-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const REQUESTER = 'user_support_a';
const APPROVER = 'user_support_b';
const REASON = 'Customer reported missing messages after a failed import, ticket attached.';
const TICKET = 'SUP-4821';

interface GrantRecord {
  id: string;
  organization_id: string;
  requested_by_user_id: string;
  approved_by_user_id: string | null;
  revoked_by_user_id: string | null;
  reason: string;
  ticket_ref: string;
  scopes: string[];
  status: SupportAccessStatus;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

interface EventRecord {
  id: number;
  grant_id: string | null;
  organization_id: string;
  actor_user_id: string;
  event: string;
  resource_type: string | null;
  resource_id: string | null;
  row_count: number | null;
  detail: Record<string, unknown>;
  occurred_at: string;
  previous_hash: string;
  entry_hash: string;
}

// The fake enforces the two properties 0229 enforces with check constraints, a
// second approver and an eight-hour ceiling, so a pass here is not a pass
// bought by a fake more permissive than the database.
function harness(startedAt = Date.parse('2026-09-17T09:00:00.000Z')) {
  const grants: GrantRecord[] = [];
  const events: EventRecord[] = [];
  let clock = startedAt;
  let nextGrant = 0;

  const now = () => new Date(clock).toISOString();

  function insertGrant(params: unknown[]): GrantRecord {
    nextGrant += 1;
    const grant: GrantRecord = {
      id: `grant-${nextGrant}`,
      organization_id: params[0] as string,
      requested_by_user_id: params[1] as string,
      approved_by_user_id: null,
      revoked_by_user_id: null,
      reason: params[2] as string,
      ticket_ref: params[3] as string,
      scopes: params[4] as string[],
      status: 'pending',
      requested_at: now(),
      decided_at: null,
      expires_at: null,
      revoked_at: null,
    };
    grants.push(grant);
    return grant;
  }

  function approve(params: unknown[]): GrantRecord[] {
    const [id, approver, ttlMs, ceilingMs] = params as [string, string, number, number];
    const grant = grants.find((row) => row.id === id && row.status === 'pending');
    if (!grant) return [];
    if (grant.requested_by_user_id === approver) {
      throw new Error('support_access_grants_needs_a_second_approver');
    }
    grant.status = 'approved';
    grant.approved_by_user_id = approver;
    grant.decided_at = now();
    grant.expires_at = new Date(
      Math.min(clock + ttlMs, Date.parse(grant.requested_at) + ceilingMs),
    ).toISOString();
    return [grant];
  }

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('insert into public.support_access_grants')) {
      return [insertGrant(params)] as never[];
    }
    if (sql.includes('select entry_hash from public.support_access_events')) {
      const own = events.filter((row) => row.organization_id === params[0]);
      const last = own.at(-1);
      return (last ? [{ entry_hash: last.entry_hash }] : []) as never[];
    }
    if (sql.includes("set status = 'approved'")) return approve(params) as never[];
    if (sql.includes("set status = 'denied'")) {
      const grant = grants.find((row) => row.id === params[0] && row.status === 'pending');
      if (!grant) return [] as never[];
      grant.status = 'denied';
      grant.decided_at = now();
      return [grant] as never[];
    }
    if (sql.includes("set status = 'revoked'")) {
      const grant = grants.find(
        (row) => row.id === params[0] && (row.status === 'pending' || row.status === 'approved'),
      );
      if (!grant) return [] as never[];
      grant.status = 'revoked';
      grant.revoked_at = now();
      grant.revoked_by_user_id = params[1] as string;
      return [grant] as never[];
    }
    if (sql.includes('from public.support_access_grants where id = $1')) {
      return grants.filter((row) => row.id === params[0]) as never[];
    }
    if (sql.includes("where status = 'approved' and expires_at <= now()")) {
      return grants.filter(
        (row) => row.status === 'approved' && Date.parse(row.expires_at ?? '') <= clock,
      ) as never[];
    }
    if (sql.includes('and $3 = any (scopes)')) {
      return grants.filter(
        (row) =>
          row.organization_id === params[0] &&
          row.requested_by_user_id === params[1] &&
          row.status === 'approved' &&
          Date.parse(row.expires_at ?? '') > clock &&
          row.scopes.includes(params[2] as string),
      ) as never[];
    }
    if (sql.includes('from public.support_access_events')) {
      return events.filter((row) => row.organization_id === params[0]) as never[];
    }
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
  });

  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('insert into public.support_access_events')) {
      events.push({
        id: events.length + 1,
        grant_id: params[0] as string | null,
        organization_id: params[1] as string,
        actor_user_id: params[2] as string,
        event: params[3] as string,
        resource_type: params[4] as string | null,
        resource_id: params[5] as string | null,
        row_count: params[6] as number | null,
        detail: JSON.parse(params[7] as string) as Record<string, unknown>,
        occurred_at: params[8] as string,
        previous_hash: params[9] as string,
        entry_hash: params[10] as string,
      });
      return 1;
    }
    if (sql.includes("set status = 'expired'")) {
      const grant = grants.find(
        (row) =>
          row.id === params[0] &&
          row.status === 'approved' &&
          Date.parse(row.expires_at ?? '') <= clock,
      );
      if (!grant) return 0;
      grant.status = 'expired';
      return 1;
    }
    throw new Error(`unexpected execute: ${sql.slice(0, 80)}`);
  });

  const db = {
    query,
    execute,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(db),
  } as unknown as DatabaseAdapter;

  return {
    db,
    events,
    grants,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

async function approvedGrant(h: ReturnType<typeof harness>, scopes = ['conversations' as const]) {
  const requested = await requestSupportAccess({
    db: h.db,
    organizationId: ORG,
    requestedByUserId: REQUESTER,
    reason: REASON,
    ticketRef: TICKET,
    scopes,
  });
  return approveSupportAccess({ db: h.db, grantId: requested.id, actorUserId: APPROVER });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requesting a grant', () => {
  it('records the request as pending and appends it to the trail', async () => {
    const h = harness();
    const grant = await requestSupportAccess({
      db: h.db,
      organizationId: ORG,
      requestedByUserId: REQUESTER,
      reason: REASON,
      ticketRef: TICKET,
      scopes: ['conversations'],
    });

    expect(grant.status).toBe('pending');
    expect(grant.expiresAt).toBeNull();
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ event: 'requested', actor_user_id: REQUESTER });
  });

  it('refuses a reason too short for the workspace reading it to learn anything', async () => {
    const h = harness();
    await expect(
      requestSupportAccess({
        db: h.db,
        organizationId: ORG,
        requestedByUserId: REQUESTER,
        reason: 'debugging',
        ticketRef: TICKET,
        scopes: ['conversations'],
      }),
    ).rejects.toBeInstanceOf(SupportAccessRequestError);
    expect(h.grants).toHaveLength(0);
  });

  it('refuses a request naming no scope at all', async () => {
    const h = harness();
    await expect(
      requestSupportAccess({
        db: h.db,
        organizationId: ORG,
        requestedByUserId: REQUESTER,
        reason: REASON,
        ticketRef: TICKET,
        scopes: [],
      }),
    ).rejects.toThrow(/at least one scope/i);
  });
});

describe('approval needs a second operator', () => {
  it('refuses the requester approving their own request', async () => {
    const h = harness();
    const grant = await requestSupportAccess({
      db: h.db,
      organizationId: ORG,
      requestedByUserId: REQUESTER,
      reason: REASON,
      ticketRef: TICKET,
      scopes: ['conversations'],
    });

    await expect(
      approveSupportAccess({ db: h.db, grantId: grant.id, actorUserId: REQUESTER }),
    ).rejects.toThrow(/second operator/i);
    expect(h.grants[0]?.status).toBe('pending');
  });

  it('approves for a second operator and writes an expiry', async () => {
    const h = harness();
    const grant = await approvedGrant(h);

    expect(grant.status).toBe('approved');
    expect(grant.approvedByUserId).toBe(APPROVER);
    expect(Date.parse(grant.expiresAt ?? '')).toBeGreaterThan(Date.parse(grant.requestedAt));
    expect(h.events.map((event) => event.event)).toEqual(['requested', 'approved']);
  });

  it('never writes a window longer than the ceiling, whatever is asked for', async () => {
    const h = harness();
    const requested = await requestSupportAccess({
      db: h.db,
      organizationId: ORG,
      requestedByUserId: REQUESTER,
      reason: REASON,
      ticketRef: TICKET,
      scopes: ['conversations'],
    });
    await expect(
      approveSupportAccess({
        db: h.db,
        grantId: requested.id,
        actorUserId: APPROVER,
        ttlMs: MAX_SUPPORT_ACCESS_TTL_MS * 4,
      }),
    ).rejects.toThrow(/at most/i);

    const grant = await approveSupportAccess({
      db: h.db,
      grantId: requested.id,
      actorUserId: APPROVER,
      ttlMs: MAX_SUPPORT_ACCESS_TTL_MS,
    });
    expect(Date.parse(grant.expiresAt ?? '') - Date.parse(grant.requestedAt)).toBeLessThanOrEqual(
      MAX_SUPPORT_ACCESS_TTL_MS,
    );
  });
});

describe('the gate', () => {
  it('refuses a read no grant covers, and records the refusal', async () => {
    const h = harness();
    await expect(
      assertSupportAccess({
        db: h.db,
        organizationId: ORG,
        actorUserId: REQUESTER,
        scope: 'conversations',
      }),
    ).rejects.toBeInstanceOf(SupportAccessDeniedError);

    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({ event: 'refused', resource_type: 'conversations' });
  });

  it('refuses a scope the grant does not name', async () => {
    const h = harness();
    await approvedGrant(h, ['conversations']);

    await expect(
      assertSupportAccess({
        db: h.db,
        organizationId: ORG,
        actorUserId: REQUESTER,
        scope: 'billing',
      }),
    ).rejects.toBeInstanceOf(SupportAccessDeniedError);
    expect(h.events.at(-1)).toMatchObject({ event: 'refused', resource_type: 'billing' });
  });

  it('refuses another operator riding a colleague’s grant', async () => {
    const h = harness();
    await approvedGrant(h);

    await expect(
      assertSupportAccess({
        db: h.db,
        organizationId: ORG,
        actorUserId: 'user_support_c',
        scope: 'conversations',
      }),
    ).rejects.toBeInstanceOf(SupportAccessDeniedError);
  });

  it('records every read taken under a live grant', async () => {
    const h = harness();
    await approvedGrant(h);

    const rows = await withSupportAccess(
      {
        db: h.db,
        organizationId: ORG,
        actorUserId: REQUESTER,
        scope: 'conversations',
        resourceType: 'web_conversations',
        resourceId: 'conv-9',
      },
      async () => [{ id: 'conv-9' }, { id: 'conv-10' }],
    );

    expect(rows).toHaveLength(2);
    expect(h.events.at(-1)).toMatchObject({
      event: 'accessed',
      resource_type: 'web_conversations',
      resource_id: 'conv-9',
      row_count: 2,
    });
  });

  it('stops covering reads once the window closes', async () => {
    const h = harness();
    await approvedGrant(h);
    h.advance(61 * 60_000);

    await expect(
      assertSupportAccess({
        db: h.db,
        organizationId: ORG,
        actorUserId: REQUESTER,
        scope: 'conversations',
      }),
    ).rejects.toBeInstanceOf(SupportAccessDeniedError);

    expect(await expireStaleSupportAccessGrants(h.db)).toBe(1);
    expect(h.grants[0]?.status).toBe('expired');
    expect(h.events.at(-1)).toMatchObject({ event: 'expired' });
  });

  it('stops covering reads the moment the grant is revoked', async () => {
    const h = harness();
    const grant = await approvedGrant(h);
    await revokeSupportAccess({ db: h.db, grantId: grant.id, actorUserId: APPROVER });

    await expect(
      findLiveSupportAccessGrant({
        db: h.db,
        organizationId: ORG,
        actorUserId: REQUESTER,
        scope: 'conversations',
      }),
    ).resolves.toBeNull();
  });
});

describe('the trail cannot be quietly rewritten', () => {
  it('chains every entry to the one before it', async () => {
    const h = harness();
    await approvedGrant(h);
    await withSupportAccess(
      {
        db: h.db,
        organizationId: ORG,
        actorUserId: REQUESTER,
        scope: 'conversations',
        resourceType: 'web_conversations',
      },
      async () => [],
    );

    const entries = await listSupportAccessEvents(h.db, ORG);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.previousHash).toBe('0'.repeat(64));
    expect(entries[1]?.previousHash).toBe(entries[0]?.entryHash);
    expect(entries[2]?.previousHash).toBe(entries[1]?.entryHash);
    await expect(verifySupportAccessTrail(h.db, ORG)).resolves.toMatchObject({
      intact: true,
      entries: 3,
      brokenAtEventId: null,
    });
  });

  it('reports the entry that no longer hashes to what it was written with', async () => {
    const h = harness();
    await approvedGrant(h);
    const target = h.events[1];
    if (!target) throw new Error('expected an approval entry');
    target.event = 'accessed';

    await expect(verifySupportAccessTrail(h.db, ORG)).resolves.toMatchObject({
      intact: false,
      brokenAtEventId: '2',
    });
  });

  it('reports a removed entry as a broken link rather than a shorter list', async () => {
    const h = harness();
    await approvedGrant(h);
    await withSupportAccess(
      {
        db: h.db,
        organizationId: ORG,
        actorUserId: REQUESTER,
        scope: 'conversations',
        resourceType: 'web_conversations',
      },
      async () => [],
    );
    h.events.splice(1, 1);

    await expect(verifySupportAccessTrail(h.db, ORG)).resolves.toMatchObject({
      intact: false,
      reason: 'an entry names a predecessor that is not the entry before it',
    });
  });
});
