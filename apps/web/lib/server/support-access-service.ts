import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

// A refused read is appended to the trail as well as a granted one, and each
// event carries the hash of the one before it, so a removed row leaves a break.

export const SUPPORT_ACCESS_SCOPES = Object.freeze([
  'conversations',
  'files',
  'projects',
  'connectors',
  'billing',
  'audit_logs',
  'workspace_settings',
] as const);

export type SupportAccessScope = (typeof SUPPORT_ACCESS_SCOPES)[number];

export type SupportAccessStatus = 'pending' | 'approved' | 'denied' | 'revoked' | 'expired';

export type SupportAccessEventName =
  'requested' | 'approved' | 'denied' | 'revoked' | 'expired' | 'accessed' | 'refused';

export const DEFAULT_SUPPORT_ACCESS_TTL_MS = 60 * 60_000;
export const MAX_SUPPORT_ACCESS_TTL_MS = 8 * 60 * 60_000;
export const MIN_SUPPORT_ACCESS_REASON_LENGTH = 20;
const MAX_SUPPORT_ACCESS_REASON_LENGTH = 2_000;
const MIN_TICKET_REF_LENGTH = 3;
const MAX_TICKET_REF_LENGTH = 128;
const GENESIS_HASH = '0'.repeat(64);
const MAX_GRANT_PAGE = 100;

export interface SupportAccessGrant {
  id: string;
  organizationId: string;
  requestedByUserId: string;
  approvedByUserId: string | null;
  revokedByUserId: string | null;
  reason: string;
  ticketRef: string;
  scopes: SupportAccessScope[];
  status: SupportAccessStatus;
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface SupportAccessEvent {
  id: string;
  grantId: string | null;
  organizationId: string;
  actorUserId: string;
  event: SupportAccessEventName;
  resourceType: string | null;
  resourceId: string | null;
  rowCount: number | null;
  detail: Record<string, unknown>;
  occurredAt: string;
  previousHash: string;
  entryHash: string;
}

export class SupportAccessDeniedError extends Error {
  readonly organizationId: string;
  readonly scope: string;

  constructor(organizationId: string, scope: string, reason: string) {
    super(
      `Support access to workspace ${organizationId} for "${scope}" is refused: ${reason}. ` +
        'Request a break-glass grant and have a second operator approve it.',
    );
    this.name = 'SupportAccessDeniedError';
    this.organizationId = organizationId;
    this.scope = scope;
  }
}

export class SupportAccessRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupportAccessRequestError';
  }
}

function isSupportAccessScope(value: unknown): value is SupportAccessScope {
  return typeof value === 'string' && (SUPPORT_ACCESS_SCOPES as readonly string[]).includes(value);
}

export function parseSupportAccessScopes(value: unknown): SupportAccessScope[] {
  const raw = Array.isArray(value) ? value : [];
  const scopes = [...new Set(raw.filter(isSupportAccessScope))];
  if (scopes.length === 0) {
    throw new SupportAccessRequestError(
      `Name at least one scope to access: ${SUPPORT_ACCESS_SCOPES.join(', ')}.`,
    );
  }
  return scopes;
}

function assertReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < MIN_SUPPORT_ACCESS_REASON_LENGTH) {
    throw new SupportAccessRequestError(
      `State why this access is needed in at least ${MIN_SUPPORT_ACCESS_REASON_LENGTH} characters; ` +
        'the workspace reads this reason.',
    );
  }
  if (trimmed.length > MAX_SUPPORT_ACCESS_REASON_LENGTH) {
    throw new SupportAccessRequestError(
      `Reason is longer than ${MAX_SUPPORT_ACCESS_REASON_LENGTH} characters.`,
    );
  }
  return trimmed;
}

function assertTicketRef(ticketRef: string): string {
  const trimmed = ticketRef.trim();
  if (trimmed.length < MIN_TICKET_REF_LENGTH || trimmed.length > MAX_TICKET_REF_LENGTH) {
    throw new SupportAccessRequestError(
      `Name the ticket this access belongs to (${MIN_TICKET_REF_LENGTH}-${MAX_TICKET_REF_LENGTH} characters).`,
    );
  }
  return trimmed;
}

function assertTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new SupportAccessRequestError(
      'A grant window must be a positive number of milliseconds.',
    );
  }
  if (ttlMs > MAX_SUPPORT_ACCESS_TTL_MS) {
    throw new SupportAccessRequestError(
      `A grant may last at most ${MAX_SUPPORT_ACCESS_TTL_MS / 60_000} minutes; ` +
        'ask again if the work outlives it.',
    );
  }
  return Math.trunc(ttlMs);
}

interface GrantRow extends Record<string, unknown> {
  id: string;
  organization_id: string;
  requested_by_user_id: string;
  approved_by_user_id: string | null;
  revoked_by_user_id: string | null;
  reason: string;
  ticket_ref: string;
  scopes: string[];
  status: SupportAccessStatus;
  requested_at: string | Date;
  decided_at: string | Date | null;
  expires_at: string | Date | null;
  revoked_at: string | Date | null;
}

interface EventRow extends Record<string, unknown> {
  id: string | number;
  grant_id: string | null;
  organization_id: string;
  actor_user_id: string;
  event: SupportAccessEventName;
  resource_type: string | null;
  resource_id: string | null;
  row_count: number | string | null;
  detail: Record<string, unknown> | null;
  occurred_at: string | Date;
  previous_hash: string;
  entry_hash: string;
}

const GRANT_COLUMNS = `id, organization_id, requested_by_user_id, approved_by_user_id,
  revoked_by_user_id, reason, ticket_ref, scopes, status, requested_at, decided_at,
  expires_at, revoked_at`;

const EVENT_COLUMNS = `id, grant_id, organization_id, actor_user_id, event, resource_type,
  resource_id, row_count, detail, occurred_at, previous_hash, entry_hash`;

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapGrant(row: GrantRow): SupportAccessGrant {
  return {
    id: row.id,
    organizationId: row.organization_id,
    requestedByUserId: row.requested_by_user_id,
    approvedByUserId: row.approved_by_user_id,
    revokedByUserId: row.revoked_by_user_id,
    reason: row.reason,
    ticketRef: row.ticket_ref,
    scopes: row.scopes.filter(isSupportAccessScope),
    status: row.status,
    requestedAt: iso(row.requested_at) ?? '',
    decidedAt: iso(row.decided_at),
    expiresAt: iso(row.expires_at),
    revokedAt: iso(row.revoked_at),
  };
}

function mapEvent(row: EventRow): SupportAccessEvent {
  return {
    id: String(row.id),
    grantId: row.grant_id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    event: row.event,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    rowCount: row.row_count === null ? null : Number(row.row_count),
    detail: row.detail ?? {},
    occurredAt: iso(row.occurred_at) ?? '',
    previousHash: row.previous_hash,
    entryHash: row.entry_hash,
  };
}

export interface SupportAccessEventInput {
  grantId: string | null;
  organizationId: string;
  actorUserId: string;
  event: SupportAccessEventName;
  resourceType?: string | null;
  resourceId?: string | null;
  rowCount?: number | null;
  detail?: Record<string, unknown>;
}

/**
 * The chained hash of one entry.
 *
 * Every field an auditor would care about is inside the digest, in a fixed
 * order, so editing any of them in place breaks the link. `occurredAt` is
 * included as the value the row stores rather than as the wall clock, so a
 * recomputation years later reproduces the same digest.
 */
export function supportAccessEntryHash(
  previousHash: string,
  entry: SupportAccessEventInput & { occurredAt: string },
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        previousHash,
        entry.organizationId,
        entry.grantId ?? '',
        entry.actorUserId,
        entry.event,
        entry.resourceType ?? '',
        entry.resourceId ?? '',
        entry.rowCount ?? null,
        entry.detail ?? {},
        entry.occurredAt,
      ]),
    )
    .digest('hex');
}

async function appendEvent(tx: DatabaseAdapter, input: SupportAccessEventInput): Promise<string> {
  const [previous] = await tx.query<{ entry_hash: string }>(
    `select entry_hash from public.support_access_events
      where organization_id = $1
      order by id desc
      limit 1`,
    [input.organizationId],
  );
  const previousHash = previous?.entry_hash ?? GENESIS_HASH;
  const occurredAt = new Date().toISOString();
  const entryHash = supportAccessEntryHash(previousHash, { ...input, occurredAt });
  await tx.execute(
    `insert into public.support_access_events (
       grant_id, organization_id, actor_user_id, event, resource_type, resource_id,
       row_count, detail, occurred_at, previous_hash, entry_hash
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
    [
      input.grantId,
      input.organizationId,
      input.actorUserId,
      input.event,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.rowCount ?? null,
      JSON.stringify(input.detail ?? {}),
      occurredAt,
      previousHash,
      entryHash,
    ],
  );
  return entryHash;
}

export interface RequestSupportAccessInput {
  db: DatabaseAdapter;
  organizationId: string;
  requestedByUserId: string;
  reason: string;
  ticketRef: string;
  scopes: readonly SupportAccessScope[];
}

export async function requestSupportAccess(
  input: RequestSupportAccessInput,
): Promise<SupportAccessGrant> {
  const reason = assertReason(input.reason);
  const ticketRef = assertTicketRef(input.ticketRef);
  const scopes = parseSupportAccessScopes([...input.scopes]);

  return input.db.transaction(async (tx) => {
    const [row] = await tx.query<GrantRow>(
      `insert into public.support_access_grants
         (organization_id, requested_by_user_id, reason, ticket_ref, scopes)
       values ($1, $2, $3, $4, $5::text[])
       returning ${GRANT_COLUMNS}`,
      [input.organizationId, input.requestedByUserId, reason, ticketRef, scopes],
    );
    if (!row) throw new SupportAccessRequestError('The break-glass request was not recorded.');
    await appendEvent(tx, {
      grantId: row.id,
      organizationId: input.organizationId,
      actorUserId: input.requestedByUserId,
      event: 'requested',
      detail: { reason, ticketRef, scopes },
    });
    return mapGrant(row);
  });
}

export interface DecideSupportAccessInput {
  db: DatabaseAdapter;
  grantId: string;
  actorUserId: string;
  ttlMs?: number;
}

/**
 * Approval is the second pair of eyes, and it is the only place an expiry is
 * written. A requester who is also the approver is refused in this function and
 * again by a check constraint, because the property is worth nothing if it
 * holds only in the code path that happens to be in front of the database.
 */
export async function approveSupportAccess(
  input: DecideSupportAccessInput,
): Promise<SupportAccessGrant> {
  const ttlMs = assertTtl(input.ttlMs ?? DEFAULT_SUPPORT_ACCESS_TTL_MS);
  return input.db.transaction(async (tx) => {
    const grant = await loadGrantForUpdate(tx, input.grantId);
    if (grant.status !== 'pending') {
      throw new SupportAccessRequestError(
        `Grant ${grant.id} is ${grant.status}; only a pending request can be approved.`,
      );
    }
    if (grant.requestedByUserId === input.actorUserId) {
      throw new SupportAccessRequestError(
        'A break-glass grant needs a second operator: the requester cannot approve their own access.',
      );
    }
    const [row] = await tx.query<GrantRow>(
      `update public.support_access_grants
          set status = 'approved',
              approved_by_user_id = $2,
              decided_at = now(),
              expires_at = least(
                now() + make_interval(secs => $3::double precision / 1000),
                requested_at + make_interval(secs => $4::double precision / 1000)
              )
        where id = $1 and status = 'pending'
        returning ${GRANT_COLUMNS}`,
      [input.grantId, input.actorUserId, ttlMs, MAX_SUPPORT_ACCESS_TTL_MS],
    );
    if (!row) throw new SupportAccessRequestError(`Grant ${input.grantId} was not approved.`);
    await appendEvent(tx, {
      grantId: row.id,
      organizationId: row.organization_id,
      actorUserId: input.actorUserId,
      event: 'approved',
      detail: { requestedBy: row.requested_by_user_id, expiresAt: iso(row.expires_at) },
    });
    return mapGrant(row);
  });
}

export async function denySupportAccess(
  input: DecideSupportAccessInput,
): Promise<SupportAccessGrant> {
  return input.db.transaction(async (tx) => {
    const [row] = await tx.query<GrantRow>(
      `update public.support_access_grants
          set status = 'denied', decided_at = now()
        where id = $1 and status = 'pending'
        returning ${GRANT_COLUMNS}`,
      [input.grantId],
    );
    if (!row) {
      throw new SupportAccessRequestError(
        `Grant ${input.grantId} is not pending; only a pending request can be denied.`,
      );
    }
    await appendEvent(tx, {
      grantId: row.id,
      organizationId: row.organization_id,
      actorUserId: input.actorUserId,
      event: 'denied',
      detail: { requestedBy: row.requested_by_user_id },
    });
    return mapGrant(row);
  });
}

export async function revokeSupportAccess(
  input: DecideSupportAccessInput,
): Promise<SupportAccessGrant> {
  return input.db.transaction(async (tx) => {
    const [row] = await tx.query<GrantRow>(
      `update public.support_access_grants
          set status = 'revoked', revoked_at = now(), revoked_by_user_id = $2
        where id = $1 and status in ('pending', 'approved')
        returning ${GRANT_COLUMNS}`,
      [input.grantId, input.actorUserId],
    );
    if (!row) {
      throw new SupportAccessRequestError(`Grant ${input.grantId} is not live; nothing to revoke.`);
    }
    await appendEvent(tx, {
      grantId: row.id,
      organizationId: row.organization_id,
      actorUserId: input.actorUserId,
      event: 'revoked',
      detail: { requestedBy: row.requested_by_user_id },
    });
    return mapGrant(row);
  });
}

async function loadGrantForUpdate(
  tx: DatabaseAdapter,
  grantId: string,
): Promise<SupportAccessGrant> {
  const [row] = await tx.query<GrantRow>(
    `select ${GRANT_COLUMNS} from public.support_access_grants where id = $1 for update`,
    [grantId],
  );
  if (!row) throw new SupportAccessRequestError(`No break-glass grant ${grantId} exists.`);
  return mapGrant(row);
}

/**
 * Expiry is a state the trail has to carry, not a `where expires_at > now()`
 * nobody can read later. The sweep is idempotent and safe to run from the job
 * drain as often as it likes.
 */
export async function expireStaleSupportAccessGrants(db: DatabaseAdapter): Promise<number> {
  const stale = await db.query<GrantRow>(
    `select ${GRANT_COLUMNS} from public.support_access_grants
      where status = 'approved' and expires_at <= now()
      order by expires_at asc
      limit ${MAX_GRANT_PAGE}`,
    [],
  );
  let expired = 0;
  for (const row of stale) {
    const closed = await db.transaction(async (tx) => {
      const affected = await tx.execute(
        `update public.support_access_grants
            set status = 'expired'
          where id = $1 and status = 'approved' and expires_at <= now()`,
        [row.id],
      );
      if (affected !== 1) return false;
      await appendEvent(tx, {
        grantId: row.id,
        organizationId: row.organization_id,
        actorUserId: row.approved_by_user_id ?? row.requested_by_user_id,
        event: 'expired',
        detail: { expiresAt: iso(row.expires_at) },
      });
      return true;
    });
    if (closed) expired += 1;
  }
  return expired;
}

export interface SupportAccessLookup {
  db: DatabaseAdapter;
  organizationId: string;
  actorUserId: string;
  scope: SupportAccessScope;
}

export async function findLiveSupportAccessGrant(
  lookup: SupportAccessLookup,
): Promise<SupportAccessGrant | null> {
  const [row] = await lookup.db.query<GrantRow>(
    `select ${GRANT_COLUMNS} from public.support_access_grants
      where organization_id = $1
        and status = 'approved'
        and expires_at > now()
        and requested_by_user_id = $2
        and $3 = any (scopes)
      order by expires_at desc
      limit 1`,
    [lookup.organizationId, lookup.actorUserId, lookup.scope],
  );
  return row ? mapGrant(row) : null;
}

/**
 * The gate. Every support-principal read passes through here, and a read that
 * no live grant covers is refused AND recorded: the refusal is the row that
 * proves the boundary held, so it is written before the throw.
 */
export async function assertSupportAccess(
  lookup: SupportAccessLookup,
): Promise<SupportAccessGrant> {
  const grant = await findLiveSupportAccessGrant(lookup);
  if (grant) return grant;
  await lookup.db
    .transaction((tx) =>
      appendEvent(tx, {
        grantId: null,
        organizationId: lookup.organizationId,
        actorUserId: lookup.actorUserId,
        event: 'refused',
        resourceType: lookup.scope,
        detail: { scope: lookup.scope },
      }),
    )
    .catch((error: unknown) => {
      logger.error(
        { error, organizationId: lookup.organizationId, scope: lookup.scope },
        'Support access refusal could not be appended to the break-glass trail',
      );
    });
  throw new SupportAccessDeniedError(
    lookup.organizationId,
    lookup.scope,
    'no approved, unexpired grant covers it',
  );
}

export interface RecordSupportAccessInput {
  db: DatabaseAdapter;
  grant: SupportAccessGrant;
  actorUserId: string;
  resourceType: string;
  resourceId?: string | null;
  rowCount?: number | null;
}

export async function recordSupportDataAccess(input: RecordSupportAccessInput): Promise<void> {
  await input.db.transaction((tx) =>
    appendEvent(tx, {
      grantId: input.grant.id,
      organizationId: input.grant.organizationId,
      actorUserId: input.actorUserId,
      event: 'accessed',
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      rowCount: input.rowCount ?? null,
      detail: { ticketRef: input.grant.ticketRef },
    }),
  );
}

export interface SupportAccessReadInput extends SupportAccessLookup {
  resourceType: string;
  resourceId?: string | null;
}

/**
 * Read one workspace's data as support: assert, run, record. A caller that
 * cannot be bothered to use this wrapper still hits the gate, because the key
 * material for the workspace is resolved through the same assertion.
 */
export async function withSupportAccess<T>(
  input: SupportAccessReadInput,
  read: (grant: SupportAccessGrant) => Promise<T>,
): Promise<T> {
  const grant = await assertSupportAccess(input);
  const result = await read(grant);
  await recordSupportDataAccess({
    db: input.db,
    grant,
    actorUserId: input.actorUserId,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    rowCount: Array.isArray(result) ? result.length : null,
  });
  return result;
}

export interface ListSupportAccessInput {
  db: DatabaseAdapter;
  organizationId?: string | null;
  status?: SupportAccessStatus | null;
  limit?: number;
}

export async function listSupportAccessGrants(
  input: ListSupportAccessInput,
): Promise<SupportAccessGrant[]> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), MAX_GRANT_PAGE);
  const rows = await input.db.query<GrantRow>(
    `select ${GRANT_COLUMNS} from public.support_access_grants
      where ($1::uuid is null or organization_id = $1)
        and ($2::text is null or status = $2)
      order by requested_at desc
      limit $3`,
    [input.organizationId ?? null, input.status ?? null, limit],
  );
  return rows.map(mapGrant);
}

export async function listSupportAccessEvents(
  db: DatabaseAdapter,
  organizationId: string,
  limit = 200,
): Promise<SupportAccessEvent[]> {
  const rows = await db.query<EventRow>(
    `select ${EVENT_COLUMNS} from public.support_access_events
      where organization_id = $1
      order by id asc
      limit $2`,
    [organizationId, Math.min(Math.max(Math.trunc(limit), 1), 1_000)],
  );
  return rows.map(mapEvent);
}

export interface SupportAccessTrailVerification {
  organizationId: string;
  entries: number;
  intact: boolean;
  brokenAtEventId: string | null;
  reason: string | null;
}

/**
 * Recomputes the chain from the first event forward.
 *
 * `intact: false` does not say who broke it; it says the rows on disk are not
 * the rows that were written, which is the only claim a hash chain can make and
 * the only one worth publishing.
 */
export async function verifySupportAccessTrail(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<SupportAccessTrailVerification> {
  const events = await listSupportAccessEvents(db, organizationId, 1_000);
  let previousHash = GENESIS_HASH;
  for (const entry of events) {
    if (entry.previousHash !== previousHash) {
      return {
        organizationId,
        entries: events.length,
        intact: false,
        brokenAtEventId: entry.id,
        reason: 'an entry names a predecessor that is not the entry before it',
      };
    }
    const expected = supportAccessEntryHash(previousHash, {
      grantId: entry.grantId,
      organizationId: entry.organizationId,
      actorUserId: entry.actorUserId,
      event: entry.event,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      rowCount: entry.rowCount,
      detail: entry.detail,
      occurredAt: entry.occurredAt,
    });
    if (expected !== entry.entryHash) {
      return {
        organizationId,
        entries: events.length,
        intact: false,
        brokenAtEventId: entry.id,
        reason: 'an entry no longer hashes to the digest it was written with',
      };
    }
    previousHash = entry.entryHash;
  }
  return {
    organizationId,
    entries: events.length,
    intact: true,
    brokenAtEventId: null,
    reason: null,
  };
}
