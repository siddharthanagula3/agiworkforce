import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

import {
  GOOGLE_USER_DATA_WITHHELD,
  MAX_SUPPORT_ACCESS_TTL_MS,
  SupportAccessDeniedError,
  SupportAccessRequestError,
  approveSupportAccess,
  assertSupportAccess,
  expireStaleSupportAccessGrants,
  findLiveSupportAccessGrant,
  findLiveSupportAccessGrants,
  listSupportAccessEvents,
  readOperatorContentUnderGrants,
  requestSupportAccess,
  revokeSupportAccess,
  verifySupportAccessTrail,
  withSupportAccess,
  type SupportAccessPurpose,
  type SupportAccessScope,
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
  purpose: string;
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

// The fake enforces what the schema enforces with check constraints, a second
// approver, an eight-hour ceiling and the approval lifecycle of 0403, so a pass
// here is not a pass bought by a fake more permissive than the database.
const CONSENT_TICKET = '33333333-3333-4333-8333-333333333333';
const CONSENTING_MEMBER = 'user_member_1';

function jsonbRoundTrip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbRoundTrip);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) =>
      a.length !== b.length ? a.length - b.length : Buffer.compare(Buffer.from(a), Buffer.from(b)),
    );
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = jsonbRoundTrip((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

type ApprovalRule = '0229' | '0403';

function approvalIsComplete(grant: GrantRecord, rule: ApprovalRule): boolean {
  const complete =
    grant.approved_by_user_id !== null && grant.decided_at !== null && grant.expires_at !== null;
  const none = grant.approved_by_user_id === null && grant.expires_at === null;
  if (rule === '0229') return (grant.status === 'approved') === complete;
  switch (grant.status) {
    case 'approved':
    case 'expired':
      return complete;
    case 'revoked':
      return none || complete;
    default:
      return none;
  }
}

function harness(
  startedAt = Date.parse('2026-09-17T09:00:00.000Z'),
  approvalRule: ApprovalRule = '0403',
) {
  const grants: GrantRecord[] = [];

  function writeGrant(grant: GrantRecord, changes: Partial<GrantRecord>): GrantRecord {
    const next = { ...grant, ...changes };
    if (!approvalIsComplete(next, approvalRule)) {
      throw new Error('violates check constraint support_access_grants_approval_is_complete');
    }
    return Object.assign(grant, changes);
  }
  const consentTickets = new Map<string, { userId: string; organizationId: string }>([
    [CONSENT_TICKET, { userId: CONSENTING_MEMBER, organizationId: ORG }],
  ]);
  const events: EventRecord[] = [];
  let clock = startedAt;
  let nextGrant = 0;
  let eventInsertsFail = false;

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
      purpose: params[5] as string,
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
    writeGrant(grant, {
      status: 'approved',
      approved_by_user_id: approver,
      decided_at: now(),
      expires_at: new Date(
        Math.min(clock + ttlMs, Date.parse(grant.requested_at) + ceilingMs),
      ).toISOString(),
    });
    return [grant];
  }

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('from public.support_tickets as ticket')) {
      const ticket = consentTickets.get(params[0] as string);
      return (
        ticket && ticket.organizationId === params[1] ? [{ user_id: ticket.userId }] : []
      ) as never[];
    }
    if (sql.includes('insert into public.support_access_grants')) {
      return [insertGrant(params)] as never[];
    }
    if (sql.includes('pg_advisory_xact_lock')) return [] as never[];
    if (sql.includes('select entry_hash from public.support_access_events')) {
      const own = events.filter((row) => row.organization_id === params[0]);
      const last = own.at(-1);
      return (last ? [{ entry_hash: last.entry_hash }] : []) as never[];
    }
    if (sql.includes("set status = 'approved'")) return approve(params) as never[];
    if (sql.includes("set status = 'denied'")) {
      const grant = grants.find((row) => row.id === params[0] && row.status === 'pending');
      if (!grant) return [] as never[];
      writeGrant(grant, { status: 'denied', decided_at: now() });
      return [grant] as never[];
    }
    if (sql.includes("set status = 'revoked'")) {
      const grant = grants.find(
        (row) => row.id === params[0] && (row.status === 'pending' || row.status === 'approved'),
      );
      if (!grant) return [] as never[];
      writeGrant(grant, {
        status: 'revoked',
        revoked_at: now(),
        revoked_by_user_id: params[1] as string,
      });
      return [grant] as never[];
    }
    if (sql.includes('from public.support_access_grants where id = $1')) {
      return grants.filter((row) => row.id === params[0]) as never[];
    }
    if (sql.includes("where status = 'approved' and expires_at <= now()")) {
      const limit = Number(/limit (\d+)/.exec(sql)?.[1] ?? Number.POSITIVE_INFINITY);
      return grants
        .filter((row) => row.status === 'approved' && Date.parse(row.expires_at ?? '') <= clock)
        .sort(
          (left, right) => Date.parse(left.expires_at ?? '') - Date.parse(right.expires_at ?? ''),
        )
        .slice(0, limit) as never[];
    }
    if (sql.includes('organization_id = any ($3::uuid[])')) {
      const wanted = params[2] as string[];
      return grants.filter(
        (row) =>
          wanted.includes(row.organization_id) &&
          row.requested_by_user_id === params[0] &&
          row.status === 'approved' &&
          Date.parse(row.expires_at ?? '') > clock &&
          row.scopes.includes(params[1] as string),
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
      if (eventInsertsFail) throw new Error('support_access_events insert failed');
      events.push({
        id: events.length + 1,
        grant_id: params[0] as string | null,
        organization_id: params[1] as string,
        actor_user_id: params[2] as string,
        event: params[3] as string,
        resource_type: params[4] as string | null,
        resource_id: params[5] as string | null,
        row_count: params[6] as number | null,
        detail: jsonbRoundTrip(JSON.parse(params[7] as string)) as Record<string, unknown>,
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
      writeGrant(grant, { status: 'expired' });
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
    failEventInserts: (fail: boolean) => {
      eventInsertsFail = fail;
    },
  };
}

async function approvedGrant(
  h: ReturnType<typeof harness>,
  scopes: SupportAccessScope[] = ['conversations'],
  purpose: SupportAccessPurpose = 'support',
) {
  const requested = await requestSupportAccess({
    db: h.db,
    organizationId: ORG,
    requestedByUserId: REQUESTER,
    reason: REASON,
    ticketRef: purpose === 'customer_consent' ? CONSENT_TICKET : TICKET,
    purpose,
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
      purpose: 'support',
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
        purpose: 'support',
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
        purpose: 'support',
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
      purpose: 'support',
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
      purpose: 'support',
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

    expect(await expireStaleSupportAccessGrants(h.db)).toEqual({
      expired: 1,
      failed: 0,
      more: false,
    });
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

describe('an approved grant can be withdrawn or lapse', () => {
  it('revokes a live grant, keeps its approval and records the revocation', async () => {
    const h = harness();
    const grant = await approvedGrant(h);

    const revoked = await revokeSupportAccess({
      db: h.db,
      grantId: grant.id,
      actorUserId: APPROVER,
    });

    expect(revoked).toMatchObject({ status: 'revoked', approvedByUserId: APPROVER });
    expect(h.grants[0]).toMatchObject({
      status: 'revoked',
      approved_by_user_id: APPROVER,
      revoked_by_user_id: APPROVER,
    });
    expect(h.grants[0]?.decided_at).not.toBeNull();
    expect(h.grants[0]?.expires_at).not.toBeNull();
    expect(h.events.at(-1)).toMatchObject({ event: 'revoked', grant_id: grant.id });
  });

  it('withdraws a pending request that was never approved', async () => {
    const h = harness();
    const requested = await requestSupportAccess({
      db: h.db,
      organizationId: ORG,
      requestedByUserId: REQUESTER,
      reason: REASON,
      ticketRef: TICKET,
      purpose: 'support',
      scopes: ['conversations'],
    });

    await revokeSupportAccess({ db: h.db, grantId: requested.id, actorUserId: APPROVER });

    expect(h.grants[0]).toMatchObject({
      status: 'revoked',
      approved_by_user_id: null,
      expires_at: null,
    });
  });

  it('expires a lapsed grant, keeps its approval and records the expiry', async () => {
    const h = harness();
    const grant = await approvedGrant(h);
    h.advance(MAX_SUPPORT_ACCESS_TTL_MS + 60_000);

    expect(await expireStaleSupportAccessGrants(h.db)).toEqual({
      expired: 1,
      failed: 0,
      more: false,
    });
    expect(h.grants[0]).toMatchObject({ status: 'expired', approved_by_user_id: APPROVER });
    expect(h.grants[0]?.decided_at).not.toBeNull();
    expect(h.grants[0]?.expires_at).not.toBeNull();
    expect(h.events.at(-1)).toMatchObject({ event: 'expired', grant_id: grant.id });
    await expect(verifySupportAccessTrail(h.db, ORG)).resolves.toMatchObject({ intact: true });
  });

  it('does nothing when no approved grant has lapsed', async () => {
    const h = harness();
    await approvedGrant(h);
    const eventsBefore = h.events.length;

    expect(await expireStaleSupportAccessGrants(h.db)).toEqual({
      expired: 0,
      failed: 0,
      more: false,
    });
    expect(h.grants[0]?.status).toBe('approved');
    expect(h.events).toHaveLength(eventsBefore);
  });

  it('closes a lapsed grant once, however often the sweep runs', async () => {
    const h = harness();
    await approvedGrant(h);
    h.advance(MAX_SUPPORT_ACCESS_TTL_MS + 60_000);

    await expireStaleSupportAccessGrants(h.db);
    const eventsAfterFirst = h.events.length;

    expect(await expireStaleSupportAccessGrants(h.db)).toEqual({
      expired: 0,
      failed: 0,
      more: false,
    });
    expect(h.events).toHaveLength(eventsAfterFirst);
  });

  it('leaves a revoked grant and a live grant alone', async () => {
    const h = harness();
    const revoked = await approvedGrant(h);
    await revokeSupportAccess({ db: h.db, grantId: revoked.id, actorUserId: APPROVER });
    h.advance(MAX_SUPPORT_ACCESS_TTL_MS + 60_000);
    await approvedGrant(h);

    expect(await expireStaleSupportAccessGrants(h.db)).toEqual({
      expired: 0,
      failed: 0,
      more: false,
    });
    expect(h.grants.map((grant) => grant.status)).toEqual(['revoked', 'approved']);
  });

  it('closes the other grants when one cannot be closed, and counts the failure', async () => {
    const h = harness();
    const stuck = await approvedGrant(h);
    const sound = await approvedGrant(h, ['files']);
    const stuckRow = h.grants.find((grant) => grant.id === stuck.id);
    if (stuckRow) stuckRow.decided_at = null;
    h.advance(MAX_SUPPORT_ACCESS_TTL_MS + 60_000);

    expect(await expireStaleSupportAccessGrants(h.db)).toEqual({
      expired: 1,
      failed: 1,
      more: false,
    });
    expect(h.grants.find((grant) => grant.id === stuck.id)?.status).toBe('approved');
    expect(h.grants.find((grant) => grant.id === sound.id)?.status).toBe('expired');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ grantId: stuck.id, organizationId: ORG }),
      expect.stringContaining('could not be closed'),
    );
  });

  it('takes a bounded batch, oldest first, and says that grants remain', async () => {
    const h = harness();
    const base = Date.parse('2026-09-17T10:00:00.000Z');
    for (let index = 0; index < 101; index += 1) {
      h.grants.push({
        id: `lapsed-${index}`,
        organization_id: ORG,
        requested_by_user_id: REQUESTER,
        approved_by_user_id: APPROVER,
        revoked_by_user_id: null,
        reason: REASON,
        ticket_ref: TICKET,
        purpose: 'support',
        scopes: ['conversations'],
        status: 'approved',
        requested_at: '2026-09-17T09:00:00.000Z',
        decided_at: '2026-09-17T09:30:00.000Z',
        expires_at: new Date(base + index * 1_000).toISOString(),
        revoked_at: null,
      });
    }
    h.advance(MAX_SUPPORT_ACCESS_TTL_MS + 60_000);

    expect(await expireStaleSupportAccessGrants(h.db)).toEqual({
      expired: 100,
      failed: 0,
      more: true,
    });
    expect(
      h.grants.filter((grant) => grant.status === 'approved').map((grant) => grant.id),
    ).toEqual(['lapsed-100']);

    expect(await expireStaleSupportAccessGrants(h.db)).toEqual({
      expired: 1,
      failed: 0,
      more: false,
    });
  });

  it('could not withdraw a live grant under the 0229 constraint', async () => {
    const h = harness(undefined, '0229');
    const grant = await approvedGrant(h);

    await expect(
      revokeSupportAccess({ db: h.db, grantId: grant.id, actorUserId: APPROVER }),
    ).rejects.toThrow(/support_access_grants_approval_is_complete/);
    h.advance(MAX_SUPPORT_ACCESS_TTL_MS + 60_000);
    expect(await expireStaleSupportAccessGrants(h.db)).toEqual({
      expired: 0,
      failed: 1,
      more: false,
    });
    expect(h.grants[0]?.status).toBe('approved');
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

  it('verifies an untouched request after the database reorders its detail keys', async () => {
    const h = harness();
    await requestSupportAccess({
      db: h.db,
      organizationId: ORG,
      requestedByUserId: REQUESTER,
      reason: REASON,
      ticketRef: TICKET,
      purpose: 'support',
      scopes: ['conversations'],
    });

    expect(Object.keys(h.events[0]?.detail ?? {})).toEqual([
      'reason',
      'scopes',
      'purpose',
      'ticketRef',
    ]);
    await expect(verifySupportAccessTrail(h.db, ORG)).resolves.toMatchObject({
      intact: true,
      entries: 1,
    });
  });

  it('still verifies an entry written under the original digest', async () => {
    const h = harness();
    const occurredAt = '2026-09-17T09:00:00.000Z';
    const detail = { scope: 'conversations' };
    const previousHash = '0'.repeat(64);
    const entryHash = createHash('sha256')
      .update(
        JSON.stringify([
          previousHash,
          ORG,
          '',
          REQUESTER,
          'refused',
          'conversations',
          '',
          null,
          detail,
          occurredAt,
        ]),
      )
      .digest('hex');
    h.events.push({
      id: 1,
      grant_id: null,
      organization_id: ORG,
      actor_user_id: REQUESTER,
      event: 'refused',
      resource_type: 'conversations',
      resource_id: null,
      row_count: null,
      detail,
      occurred_at: occurredAt,
      previous_hash: previousHash,
      entry_hash: entryHash,
    });

    await expect(verifySupportAccessTrail(h.db, ORG)).resolves.toMatchObject({ intact: true });

    const target = h.events[0];
    if (!target) throw new Error('expected the legacy entry');
    target.detail = { scope: 'billing' };
    await expect(verifySupportAccessTrail(h.db, ORG)).resolves.toMatchObject({
      intact: false,
      brokenAtEventId: '1',
    });
  });
});

const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

interface OperatorRow {
  id: string;
  organizationId: string | null;
  payload: Record<string, unknown>;
}

function rows(): OperatorRow[] {
  return [
    { id: 'a', organizationId: ORG, payload: { body: 'tenant words' } },
    { id: 'b', organizationId: OTHER_ORG, payload: { body: 'other tenant words' } },
    { id: 'c', organizationId: null, payload: { body: 'no workspace at all' } },
  ];
}

function listing(h: ReturnType<typeof harness>) {
  return readOperatorContentUnderGrants<OperatorRow>({
    db: h.db,
    actorUserId: REQUESTER,
    scope: 'conversations',
    resourceType: 'operator_listing',
    records: rows(),
    organizationIdOf: (row) => row.organizationId,
    withoutContent: (row) => ({ ...row, payload: {} }),
  });
}

describe('an operator listing that spans workspaces', () => {
  it('serves content only for the workspace a live grant covers', async () => {
    const h = harness();
    await approvedGrant(h);

    const view = await listing(h);

    expect(view.records[0]?.payload).toEqual({ body: 'tenant words' });
    expect(view.records[1]?.payload).toEqual({});
    expect(view.records[2]?.payload).toEqual({});
    expect(view.grantedOrganizationIds).toEqual([ORG]);
    expect(view.redactedCount).toBe(2);
  });

  it('serves nothing when the operator holds no grant anywhere', async () => {
    const h = harness();

    const view = await listing(h);

    expect(view.records.every((row) => Object.keys(row.payload).length === 0)).toBe(true);
    expect(view.grantedOrganizationIds).toEqual([]);
    expect(view.redactedCount).toBe(3);
  });

  it('stops serving content on the next listing once the grant is revoked', async () => {
    const h = harness();
    const grant = await approvedGrant(h);
    await expect(listing(h)).resolves.toMatchObject({ redactedCount: 2 });

    await revokeSupportAccess({ db: h.db, grantId: grant.id, actorUserId: APPROVER });

    await expect(listing(h)).resolves.toMatchObject({ redactedCount: 3 });
  });

  it('stops serving content on the next listing once the grant has expired', async () => {
    const h = harness();
    await approvedGrant(h);
    await expect(listing(h)).resolves.toMatchObject({ redactedCount: 2 });

    h.advance(61 * 60_000);

    await expect(listing(h)).resolves.toMatchObject({ redactedCount: 3 });
  });

  it('serves nothing when the grant names a different scope', async () => {
    const h = harness();
    await approvedGrant(h, ['billing']);

    await expect(listing(h)).resolves.toMatchObject({ redactedCount: 3 });
  });

  it('appends one accessed entry naming the grant and the rows it served', async () => {
    const h = harness();
    const grant = await approvedGrant(h);

    await listing(h);

    const accessed = h.events.filter((event) => event.event === 'accessed');
    expect(accessed).toHaveLength(1);
    expect(accessed[0]).toMatchObject({
      grant_id: grant.id,
      organization_id: ORG,
      actor_user_id: REQUESTER,
      resource_type: 'operator_listing',
      row_count: 1,
    });
    await expect(verifySupportAccessTrail(h.db, ORG)).resolves.toMatchObject({ intact: true });
  });

  it('serves a workspace without content when its accessed entry cannot be appended', async () => {
    const h = harness();
    await approvedGrant(h);
    h.failEventInserts(true);

    const view = await listing(h);

    expect(view.records.every((row) => Object.keys(row.payload).length === 0)).toBe(true);
    expect(view.grantedOrganizationIds).toEqual([]);
    expect(view.redactedCount).toBe(3);
    expect(h.events.filter((event) => event.event === 'accessed')).toHaveLength(0);
  });

  it('asks the database once for every workspace on the page', async () => {
    const h = harness();
    await approvedGrant(h);

    const grants = await findLiveSupportAccessGrants({
      db: h.db,
      actorUserId: REQUESTER,
      scope: 'conversations',
      organizationIds: [ORG, OTHER_ORG, ORG],
    });

    expect([...grants.keys()]).toEqual([ORG]);
  });
});

describe('every grant names its purpose', () => {
  it('refuses a request that names no purpose', async () => {
    const h = harness();
    await expect(
      requestSupportAccess({
        db: h.db,
        organizationId: ORG,
        requestedByUserId: REQUESTER,
        reason: REASON,
        ticketRef: TICKET,
        purpose: undefined as unknown as SupportAccessPurpose,
        scopes: ['conversations'],
      }),
    ).rejects.toThrow(/purpose/i);
    expect(h.grants).toHaveLength(0);
    expect(h.events).toHaveLength(0);
  });

  it('refuses a purpose this build does not define', async () => {
    const h = harness();
    await expect(
      requestSupportAccess({
        db: h.db,
        organizationId: ORG,
        requestedByUserId: REQUESTER,
        reason: REASON,
        ticketRef: TICKET,
        purpose: 'curiosity' as SupportAccessPurpose,
        scopes: ['conversations'],
      }),
    ).rejects.toBeInstanceOf(SupportAccessRequestError);
  });

  it('records the purpose on the grant and in the requested and approved trail entries', async () => {
    const h = harness();
    const grant = await approvedGrant(h, ['background_jobs'], 'security');

    expect(grant.purpose).toBe('security');
    expect(h.grants[0]?.purpose).toBe('security');
    expect(h.events[0]).toMatchObject({
      event: 'requested',
      detail: expect.objectContaining({ purpose: 'security', ticketRef: TICKET }),
    });
    expect(h.events[1]).toMatchObject({
      event: 'approved',
      detail: expect.objectContaining({ purpose: 'security' }),
    });
    await expect(verifySupportAccessTrail(h.db, ORG)).resolves.toMatchObject({ intact: true });
  });

  it('records the purpose on every read taken under the grant', async () => {
    const h = harness();
    await approvedGrant(h, ['conversations'], 'legal');
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

    expect(h.events.at(-1)).toMatchObject({
      event: 'accessed',
      detail: { ticketRef: TICKET, purpose: 'legal' },
    });
  });
});

describe('customer consent needs the customer’s ticket', () => {
  it('refuses a consent grant whose ticket reference is not a support ticket id', async () => {
    const h = harness();
    await expect(
      requestSupportAccess({
        db: h.db,
        organizationId: ORG,
        requestedByUserId: REQUESTER,
        reason: REASON,
        ticketRef: TICKET,
        purpose: 'customer_consent',
        scopes: ['background_jobs'],
      }),
    ).rejects.toThrow(/support ticket/i);
    expect(h.grants).toHaveLength(0);
  });

  it('refuses a consent grant whose ticket no member of the workspace raised', async () => {
    const h = harness();
    await expect(
      requestSupportAccess({
        db: h.db,
        organizationId: OTHER_ORG,
        requestedByUserId: REQUESTER,
        reason: REASON,
        ticketRef: CONSENT_TICKET,
        purpose: 'customer_consent',
        scopes: ['background_jobs'],
      }),
    ).rejects.toBeInstanceOf(SupportAccessRequestError);
    expect(h.grants).toHaveLength(0);
  });

  it('records which member raised the consenting ticket', async () => {
    const h = harness();
    await approvedGrant(h, ['background_jobs'], 'customer_consent');

    expect(h.events[0]?.detail).toMatchObject({
      purpose: 'customer_consent',
      ticketRef: CONSENT_TICKET,
      consentFrom: CONSENTING_MEMBER,
    });
  });
});

interface GoogleRow extends OperatorRow {
  google: boolean;
}

function googleListing(h: ReturnType<typeof harness>) {
  const records: GoogleRow[] = [
    { id: 'gmail', organizationId: ORG, google: true, payload: { snippet: 'the inbox said' } },
    { id: 'slack', organizationId: ORG, google: false, payload: { text: 'slack words' } },
  ];
  return readOperatorContentUnderGrants<GoogleRow>({
    db: h.db,
    actorUserId: REQUESTER,
    scope: 'background_jobs',
    resourceType: 'background_job',
    records,
    organizationIdOf: (row) => row.organizationId,
    withoutContent: (row) => ({ ...row, payload: {} }),
    googleUserData: {
      carries: (row) => row.google,
      withhold: (row) => ({ ...row, payload: { withheld: GOOGLE_USER_DATA_WITHHELD } }),
    },
  });
}

describe('Google user data under a grant', () => {
  it('withholds it from a support grant and says why, while serving the rest', async () => {
    const h = harness();
    await approvedGrant(h, ['background_jobs'], 'support');

    const view = await googleListing(h);

    expect(view.records[0]?.payload).toEqual({ withheld: GOOGLE_USER_DATA_WITHHELD });
    expect(GOOGLE_USER_DATA_WITHHELD).toMatch(/Google user data/);
    expect(view.records[1]?.payload).toEqual({ text: 'slack words' });
    expect(view.googleUserDataWithheldCount).toBe(1);
    expect(view.redactedCount).toBe(0);
    expect(h.events.at(-1)).toMatchObject({
      event: 'accessed',
      detail: { purpose: 'support', googleUserDataWithheld: 1 },
    });
  });

  it.each(['security', 'abuse', 'legal', 'customer_consent'] as const)(
    'shows it under a %s grant',
    async (purpose) => {
      const h = harness();
      await approvedGrant(h, ['background_jobs'], purpose);

      const view = await googleListing(h);

      expect(view.records[0]?.payload).toEqual({ snippet: 'the inbox said' });
      expect(view.googleUserDataWithheldCount).toBe(0);
      expect(h.events.at(-1)).toMatchObject({ event: 'accessed', detail: { purpose } });
    },
  );
});

type ImportedModule0 = typeof import('@/lib/logger');
