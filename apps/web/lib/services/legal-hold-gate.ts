// The one question every destructive path asks before it destroys. Scopes are
// resolved here so no caller works them out and misses custodians again.

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { resourceDeletionPolicy } from '@/lib/resources/deletion-policies';
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
  const joinsParent = parent !== null && options.owner === undefined;

  // RLS hides holds from ordinary members, so an inline read of legal_holds on
  // a member's connection answers "not held". The definer function (0416) sees
  // every hold and answers only for a row the caller may see.
  if (options.holdId === undefined) {
    const params: string[] = [];
    let store = 'null::text';
    if (options.coversParam !== undefined) {
      store = `${options.coversParam}::text`;
    } else if (resourceType !== null) {
      params.push(resourceType);
      store = `$${options.nextParamIndex}::text`;
    }
    const preserves = `public.legal_hold_preserves(${organization}::uuid, ${owner}::text, ${store})`;
    return {
      table: resource?.table ?? null,
      params,
      sql:
        joinsParent && parent
          ? `exists (
          select 1
            from public.${parent.table} hold_parent
           where hold_parent.id = ${qualify(options.alias, parent.column)}
             and ${preserves}
        )`
          : preserves,
    };
  }

  // Asking about one named hold is an administrator's question, and the
  // administrator's own connection can read every hold in the workspace.
  const join =
    joinsParent && parent
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
  params.push(options.holdId);
  const only = `\n             and h.id = $${index}::uuid`;

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

interface CascadeChild {
  resourceType: LegalHoldResourceType;
  table: string;
  column: string;
}

function holdableCascadeChildren(table: string): CascadeChild[] {
  const policy = resourceDeletionPolicy(table);
  if (policy === null) return [];
  const children: CascadeChild[] = [];
  for (const child of policy.children) {
    if (child.disposition !== 'cascade_delete') continue;
    const resource = holdableResourceForTable(child.table);
    if (resource !== null && isLegalHoldResourceType(resource.resourceType)) {
      children.push({
        resourceType: resource.resourceType,
        table: resource.table,
        column: child.column,
      });
    }
  }
  return children;
}

// A hard delete takes its cascading children with it, so a row is preserved
// when it is held itself or when any held child would go with it.
function legalHoldDeletionBranches(
  resourceType: LegalHoldResourceType | null,
  options: LegalHoldPredicateOptions,
): { branches: string[]; params: string[]; table: string | null } {
  const own = legalHoldPredicate(resourceType, options);
  const policy = own.table === null ? null : resourceDeletionPolicy(own.table);
  if (policy === null || options.holdId !== undefined || options.coversParam !== undefined) {
    return { branches: [own.sql], params: own.params, table: own.table };
  }

  const params = [...own.params];
  let nextIndex = options.nextParamIndex + own.params.length;
  let aliasCount = 0;

  const reach = (table: string, key: string, alias: string, path: ReadonlySet<string>): string[] =>
    holdableCascadeChildren(table)
      .filter((child) => !path.has(child.table))
      .map((child) => {
        aliasCount += 1;
        const childAlias = `hold_cascade_${aliasCount}`;
        const held = legalHoldPredicate(child.resourceType, {
          alias: childAlias,
          nextParamIndex: nextIndex,
        });
        params.push(...held.params);
        nextIndex += held.params.length;
        const childKey = resourceDeletionPolicy(child.table)?.keyColumn ?? 'id';
        const nested = reach(child.table, childKey, childAlias, new Set(path).add(child.table));
        return `exists (
          select 1
            from public.${child.table} ${childAlias}
           where ${childAlias}.${child.column} = ${alias}.${key}
             and (${[held.sql, ...nested].join('\n or ')})
        )`;
      });

  const branches = [
    own.sql,
    ...reach(policy.table, policy.keyColumn, options.alias, new Set([policy.table])),
  ];
  return { branches, params, table: own.table };
}

function legalHoldDeletionReach(
  resourceType: LegalHoldResourceType | null,
  options: LegalHoldPredicateOptions,
): LegalHoldPredicate {
  const { branches, params, table } = legalHoldDeletionBranches(resourceType, options);
  return {
    table,
    params,
    sql: branches.length === 1 ? branches[0]! : `(${branches.join('\n or ')})`,
  };
}

// ANDed into the destroying statement's own WHERE, so nothing can be placed
// under hold between a read and the delete.
export function legalHoldExclusion(
  resourceType: LegalHoldResourceType | null,
  options: LegalHoldPredicateOptions,
): LegalHoldPredicate {
  const { branches, params, table } = legalHoldDeletionBranches(resourceType, options);
  return { table, params, sql: branches.map((branch) => `not ${branch}`).join('\n and ') };
}

export function projectContentHoldPredicate(
  resourceType: 'project' | 'project_file',
  options: { project: string; nextParamIndex: number },
): LegalHoldPredicate {
  return {
    table: null,
    sql: `public.app_project_content_held(${options.project}, $${options.nextParamIndex})`,
    params: [resourceType],
  };
}

export function projectContentHoldFunctionSql(): string {
  const types = ['user_projects', 'project_knowledge_files'].map((table) => {
    const resource = holdableResourceForTable(table);
    if (!resource) throw new Error('Project hold resource contract is unavailable.');
    return `'${resource.resourceType.replaceAll("'", "''")}'`;
  });
  const held = legalHoldPredicate(null, {
    alias: 'p',
    owner: 'p.user_id',
    organization: 'p.organization_id',
    nextParamIndex: 1,
    coversParam: 'content_type',
  });
  return `create function public.app_project_content_held(target_project uuid, content_type text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  trusted_caller boolean;
  held_result boolean;
begin
  if content_type is null or content_type not in (${types.join(', ')}) then return true; end if;
  trusted_caller := pg_has_role(coalesce(nullif(current_setting('role'), 'none'), session_user)::name, current_user, 'USAGE');
  select ${held.sql} into held_result from public.user_projects p
    where p.id=target_project and (trusted_caller or (
      p.user_id=public.current_app_user_id()
      and p.organization_id is not distinct from public.current_app_org_id()
      and (p.organization_id is null or public.current_app_org_role() is not null)
    ));
  if not found then raise exception 'Project content access is unavailable' using errcode = '42501'; end if;
  return held_result;
end
$$;`;
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
  const render = held ? legalHoldDeletionReach : legalHoldExclusion;
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
  /** Rows whose bytes live somewhere this product cannot preserve. */
  referenceOnly: number;
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
    const resource = holdableResource(resourceType);
    if (resource === null) continue;
    const predicate = legalHoldPredicate(resourceType, {
      alias: 'held',
      nextParamIndex: 1,
      holdId: hold.id,
    });
    // A row whose stored-content column is null is a reference to bytes held
    // elsewhere; counting it as preserved claims evidence nobody has.
    const referenceOnly =
      resource.storedContentColumn === null
        ? 'count(*) filter (where false)::int'
        : `count(*) filter (where held.${resource.storedContentColumn} is null)::int`;
    const rows = await db.query<{ count: number | string; reference_only: number | string }>(
      `select count(*)::int as count, ${referenceOnly} as reference_only
         from public.${resource.table} held
        where ${predicate.sql}`,
      predicate.params,
    );
    counts.push({
      resourceType,
      table: resource.table,
      preserved: Number(rows[0]?.count ?? 0),
      referenceOnly: Number(rows[0]?.reference_only ?? 0),
    });
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

// A refused message is not remembered as a deletion, so its refusal promises nothing later.
export const HELD_MESSAGE_DELETION_REFUSAL =
  'This message is preserved by an active legal hold and cannot be deleted while the hold is active.';

export const HELD_UNDEFERRED_DELETION_REFUSAL =
  'This is preserved by an active legal hold and cannot be deleted while the hold is active.';

// Only this store keeps the refused item tombstoned for the purge cron that
// finishes the deletion after release.
const DEFERRED_HELD_DELETIONS: ReadonlySet<LegalHoldResourceType> = new Set(['file']);

export function heldDeletionRefusal(resourceType: LegalHoldResourceType): string {
  if (DEFERRED_HELD_DELETIONS.has(resourceType)) return HELD_DELETION_REFUSAL;
  if (resourceType === 'message') return HELD_MESSAGE_DELETION_REFUSAL;
  return HELD_UNDEFERRED_DELETION_REFUSAL;
}

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
  }).catch((error: unknown) => {
    logger.error(
      { error, resourceType: input.resourceType, resourceId: input.resourceId },
      '[legal-hold] refused deletion could not be audited',
    );
  });
  throw createError.forbidden(heldDeletionRefusal(input.resourceType));
}
