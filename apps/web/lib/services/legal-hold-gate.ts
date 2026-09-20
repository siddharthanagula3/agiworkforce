// The one question every destructive path asks before it destroys. Scopes are
// resolved here so no caller works them out and misses custodians again.

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  HOLDABLE_RESOURCE_TYPES,
  holdableResource,
  holdableResourceForTable,
  type HoldableResource,
} from '@agiworkforce/types';

export type LegalHoldScope = 'organization' | 'member' | 'custodian';

// Mirrored by the CHECK constraint on legal_holds.resource_types, so a hold and
// the sweeps that must not touch it cannot disagree about what a "file" is.
export const LEGAL_HOLD_RESOURCE_TYPES =
  HOLDABLE_RESOURCE_TYPES as readonly LegalHoldResourceType[];

export type LegalHoldResourceType =
  'conversation' | 'message' | 'project' | 'project_file' | 'file' | 'artifact' | 'work_run';

export function isLegalHoldResourceType(value: string): value is LegalHoldResourceType {
  return holdableResource(value) !== null;
}

export interface LegalHold {
  id: string;
  organizationId: string;
  name: string;
  reason: string | null;
  scope: LegalHoldScope;
  subjectUserId: string | null;
  /** Empty for organization and member scopes; the held people for custodian scope. */
  custodianUserIds: string[];
  /** null preserves every store, which is what a hold placed before custodians meant. */
  resourceTypes: LegalHoldResourceType[] | null;
  createdByUserId: string;
  releasedAt: string | null;
  releasedByUserId: string | null;
  createdAt: string;
}

export interface HoldRow {
  id: string;
  organization_id: string;
  name: string;
  reason: string | null;
  scope: LegalHoldScope;
  subject_user_id: string | null;
  resource_types: string[] | null;
  custodian_user_ids: string[] | null;
  created_by_user_id: string;
  released_at: string | Date | null;
  released_by_user_id: string | null;
  created_at: string | Date;
}

// Custodians as an aggregate, not a second round trip: a list that failed to
// load separately would silently preserve nobody.
export const HOLD_COLUMNS = `h.id, h.organization_id, h.name, h.reason, h.scope, h.subject_user_id,
  h.resource_types, h.created_by_user_id, h.released_at, h.released_by_user_id, h.created_at,
  coalesce(array(select c.user_id from public.legal_hold_custodians c
                  where c.hold_id = h.id order by c.user_id), array[]::text[]) as custodian_user_ids`;

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function formatHold(row: HoldRow): LegalHold {
  const resourceTypes = row.resource_types?.filter(isLegalHoldResourceType) ?? null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    reason: row.reason,
    scope: row.scope,
    subjectUserId: row.subject_user_id,
    custodianUserIds: row.custodian_user_ids ?? [],
    resourceTypes: resourceTypes && resourceTypes.length > 0 ? resourceTypes : null,
    createdByUserId: row.created_by_user_id,
    releasedAt: toIso(row.released_at),
    releasedByUserId: row.released_by_user_id,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

export async function listLegalHolds(
  db: DatabaseAdapter,
  organizationId: string,
  options: { includeReleased?: boolean } = {},
): Promise<LegalHold[]> {
  const rows = await db.query<HoldRow>(
    `select ${HOLD_COLUMNS}
       from public.legal_holds h
      where h.organization_id = $1
        ${options.includeReleased ? '' : 'and h.released_at is null'}
      order by h.created_at desc
      limit 200`,
    [organizationId],
  );
  return rows.map(formatHold);
}

export async function countActiveLegalHolds(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<number> {
  const rows = await db.query<{ count: number | string }>(
    `select count(*)::int as count
       from public.legal_holds
      where organization_id = $1 and released_at is null`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

/** Everyone a hold preserves, whichever shape it was placed in. */
export function heldSubjects(hold: LegalHold): string[] {
  if (hold.scope === 'member') return hold.subjectUserId ? [hold.subjectUserId] : [];
  if (hold.scope === 'custodian') return hold.custodianUserIds;
  return [];
}

/** A hold with no resource_types covers every store; a narrowed one covers what it names. */
export function holdCovers(hold: LegalHold, resourceType: LegalHoldResourceType): boolean {
  return hold.resourceTypes === null || hold.resourceTypes.includes(resourceType);
}

export class LegalHoldGateUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegalHoldGateUnavailableError';
  }
}

export interface LegalHoldGate {
  resourceType: LegalHoldResourceType;
  organizationId: string;
  /** Every active hold in the workspace, covering this store or not. */
  holds: LegalHold[];
  /** A hold covering this store that preserves the whole workspace. */
  organizationWide: boolean;
  /** Everyone a covering member or custodian hold preserves. */
  heldUserIds: string[];
}

/** Everyone a hold over this store preserves, whichever shape it was placed in. */
export function heldUserIdsFor(
  holds: readonly LegalHold[],
  resourceType: LegalHoldResourceType,
): string[] {
  return Array.from(
    new Set(holds.filter((hold) => holdCovers(hold, resourceType)).flatMap(heldSubjects)),
  ).sort();
}

export function organizationWideHold(
  holds: readonly LegalHold[],
  resourceType: LegalHoldResourceType,
): boolean {
  return holds.some((hold) => hold.scope === 'organization' && holdCovers(hold, resourceType));
}

export function resolveLegalHoldGate(
  organizationId: string,
  resourceType: LegalHoldResourceType,
  holds: readonly LegalHold[],
): LegalHoldGate {
  return {
    resourceType,
    organizationId,
    holds: [...holds],
    organizationWide: organizationWideHold(holds, resourceType),
    heldUserIds: heldUserIdsFor(holds, resourceType),
  };
}

// Throws rather than returning an empty gate: no holds and unreadable holds are
// the same value and opposite decisions.
export async function readLegalHoldGate(
  db: DatabaseAdapter,
  organizationId: string,
  resourceType: LegalHoldResourceType,
): Promise<LegalHoldGate> {
  let holds: LegalHold[];
  try {
    holds = await listLegalHolds(db, organizationId);
  } catch (error) {
    throw new LegalHoldGateUnavailableError(
      `Legal holds for ${organizationId} could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return resolveLegalHoldGate(organizationId, resourceType, holds);
}

export interface LegalHoldPredicate {
  /** ANDed into a statement's WHERE clause. */
  sql: string;
  /** Appended to that statement's parameters, in this order. */
  params: string[];
  /** The declared table, or null when the caller named the columns itself. */
  table: string | null;
}

function qualify(alias: string, column: string): string {
  return `${alias}.${column}`;
}

export interface LegalHoldPredicateOptions {
  /** The alias the statement gives the table being read. */
  alias: string;
  /** The 1-based position the caller's next placeholder would take. */
  nextParamIndex: number;
  /** Narrows the predicate to one hold; unset asks about every active hold. */
  holdId?: string;
  /** SQL naming the workspace when the row carries no column of its own. */
  organization?: string;
  /** SQL naming the account, for a table that is not the declared one. */
  owner?: string;
  /** Placeholder the caller binds the store to; null there means every store. */
  coversParam?: string;
}

// True for a row an active hold preserves. A resource owned through a parent
// joins it here, so a hold on a person reaches the messages in their chats.
export function legalHoldPredicate(
  resourceType: LegalHoldResourceType | null,
  options: LegalHoldPredicateOptions,
): LegalHoldPredicate {
  const resource = resourceType === null ? null : holdableResource(resourceType);
  if (resourceType !== null && !resource) {
    throw new Error(`No holdable resource declares ${resourceType}`);
  }
  if (resource === null && (options.owner === undefined || options.organization === undefined)) {
    throw new Error('A predicate over every store must name its owner and workspace columns');
  }
  if (options.coversParam !== undefined && resourceType !== null) {
    throw new Error('A predicate names its store either as a value or as a parameter, not both');
  }

  const parent = resource?.ownedVia ?? null;
  const owner =
    options.owner ??
    (parent
      ? qualify('hold_parent', ownerColumnOf(parent.table))
      : qualify(options.alias, resource?.ownerColumn ?? 'user_id'));
  const organization =
    options.organization ??
    (parent
      ? qualify('hold_parent', organizationColumnOf(parent.table))
      : qualify(options.alias, resource?.organizationColumn ?? 'organization_id'));
  const join =
    parent && options.owner === undefined
      ? `\n            join public.${parent.table} hold_parent
              on hold_parent.id = ${qualify(options.alias, parent.column)}`
      : '';

  const params: string[] = [];
  let index = options.nextParamIndex;
  let covers = '';
  if (options.coversParam !== undefined) {
    const store = options.coversParam;
    covers =
      `\n             and (${store}::text is null or h.resource_types is null` +
      `\n                  or ${store} = any(h.resource_types))`;
  } else if (resourceType !== null) {
    params.push(resourceType);
    covers = `\n             and (h.resource_types is null or $${index} = any(h.resource_types))`;
    index += 1;
  }
  let only = '';
  if (options.holdId !== undefined) {
    params.push(options.holdId);
    only = `\n             and h.id = $${index}::uuid`;
  }

  return {
    table: resource?.table ?? null,
    params,
    sql: `exists (
          select 1
            from public.legal_holds h
            left join public.legal_hold_custodians c
              on c.hold_id = h.id${join}
           where h.released_at is null
             and h.organization_id = ${organization}${covers}
             and (
               h.scope = 'organization'
               or (h.scope = 'member' and h.subject_user_id = ${owner})
               or (h.scope = 'custodian' and c.user_id = ${owner})
             )${only}
        )`,
  };
}

// ANDed into the destroying statement's own WHERE, so nothing can be placed
// under hold between a read and the delete.
export function legalHoldExclusion(
  resourceType: LegalHoldResourceType | null,
  options: LegalHoldPredicateOptions,
): LegalHoldPredicate {
  const predicate = legalHoldPredicate(resourceType, options);
  return { ...predicate, sql: `not ${predicate.sql}` };
}

// `where` is the sweep's own condition over `alias`; the hold predicate takes
// the placeholders after `params`.
async function countRowsMatching(
  db: Pick<DatabaseAdapter, 'query'>,
  resourceType: LegalHoldResourceType | null,
  options: {
    table: string;
    alias: string;
    where: string;
    params: readonly unknown[];
    organization?: string;
    owner?: string;
  },
  held: boolean,
): Promise<number> {
  const render = held ? legalHoldPredicate : legalHoldExclusion;
  const predicate = render(resourceType, {
    alias: options.alias,
    nextParamIndex: options.params.length + 1,
    organization: options.organization,
    owner: options.owner,
  });
  const rows = await db.query<{ count: number | string }>(
    `select count(*)::int as count
       from public.${options.table} ${options.alias}
      where ${options.where}
        and ${predicate.sql}`,
    [...options.params, ...predicate.params],
  );
  return Number(rows[0]?.count ?? 0);
}

export type HeldRowCountOptions = {
  table: string;
  alias: string;
  where: string;
  params: readonly unknown[];
  organization?: string;
  owner?: string;
};

// Counted with the same predicate the sweep skipped them with, so the number
// reported and the rows withheld cannot disagree.
export async function countHeldRows(
  db: Pick<DatabaseAdapter, 'query'>,
  resourceType: LegalHoldResourceType | null,
  options: HeldRowCountOptions,
): Promise<number> {
  return countRowsMatching(db, resourceType, options, true);
}

export async function countUnheldRows(
  db: Pick<DatabaseAdapter, 'query'>,
  resourceType: LegalHoldResourceType | null,
  options: HeldRowCountOptions,
): Promise<number> {
  return countRowsMatching(db, resourceType, options, false);
}

// A COUNT rather than a page of rows: a workspace's 201st hold is still a hold,
// and a capped list would silently stop preserving its custodians.
export async function countHoldsCovering(
  db: Pick<DatabaseAdapter, 'query'>,
  organizationId: string,
  resourceType: LegalHoldResourceType,
  options: { scope?: LegalHoldScope } = {},
): Promise<number> {
  const scope = options.scope === undefined ? '' : `\n        and h.scope = $3`;
  const params: unknown[] = [organizationId, resourceType];
  if (options.scope !== undefined) params.push(options.scope);
  const rows = await db.query<{ count: number | string }>(
    `select count(*)::int as count
       from public.legal_holds h
      where h.released_at is null
        and h.organization_id = $1
        and (h.resource_types is null or $2 = any(h.resource_types))${scope}`,
    params,
  );
  return Number(rows[0]?.count ?? 0);
}

export interface HeldResourceCount {
  resourceType: LegalHoldResourceType;
  table: string;
  preserved: number;
}

// A hold whose scope selects nothing reads as active and preserves no evidence,
// which an administrator has no other way to see.
export async function countHeldResources(
  db: DatabaseAdapter,
  hold: LegalHold,
  resourceTypes: readonly LegalHoldResourceType[],
): Promise<HeldResourceCount[]> {
  const counts: HeldResourceCount[] = [];
  for (const resourceType of resourceTypes) {
    if (!holdCovers(hold, resourceType)) continue;
    const table = holdableResource(resourceType)?.table;
    if (table === undefined) continue;
    const predicate = legalHoldPredicate(resourceType, {
      alias: 'held',
      nextParamIndex: 1,
      holdId: hold.id,
    });
    const rows = await db.query<{ count: number | string }>(
      `select count(*)::int as count
         from public.${table} held
        where ${predicate.sql}`,
      predicate.params,
    );
    counts.push({ resourceType, table, preserved: Number(rows[0]?.count ?? 0) });
  }
  return counts;
}

function parentResource(table: string): HoldableResource {
  const resource = holdableResourceForTable(table);
  if (!resource) {
    throw new Error(`${table} is named as a holdable resource's parent and is not itself holdable`);
  }
  return resource;
}

function ownerColumnOf(table: string): string {
  return parentResource(table).ownerColumn ?? 'user_id';
}

function organizationColumnOf(table: string): string {
  return parentResource(table).organizationColumn ?? 'organization_id';
}

// Names the consequence and its end: "forbidden" on a user's own content reads
// as a bug rather than as an obligation somebody else placed on them.
export const HELD_DELETION_REFUSAL =
  'This is preserved by an active legal hold and cannot be deleted yet. It will be deleted once the hold is released.';

// The record matters as much as the refusal: an opposing party asks whether
// anybody tried to destroy the evidence.
export async function refuseHeldDeletion(input: {
  resourceType: LegalHoldResourceType;
  resourceId: string;
  userId: string;
  organizationId: string | null;
}): Promise<never> {
  await recordAuditEvent({
    userId: input.userId,
    eventType: 'deletion_blocked_by_legal_hold',
    organizationId: input.organizationId ?? undefined,
    outcome: 'denied',
    severity: 'warning',
    detail: {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      reason: 'legal_hold',
    },
  }).catch(() => undefined);
  throw createError.forbidden(HELD_DELETION_REFUSAL);
}
