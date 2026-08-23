import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { EnterpriseAuditEvent } from '@agiworkforce/types';

export const AUDIT_PAGE_SIZE_DEFAULT = 50;
export const AUDIT_PAGE_SIZE_MAX = 200;

/** Batch size for export reads. Bounded so one export cannot pin the connection. */
export const AUDIT_EXPORT_BATCH = 500;

export interface AuditEventFilters {
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  outcome?: 'success' | 'failure' | 'denied';
  severity?: 'info' | 'warning' | 'critical';
  from?: string;
  to?: string;
}

/**
 * Keyset cursor. Ordering is (created_at DESC, id DESC) — created_at alone is
 * not unique, so an offset or a timestamp-only cursor silently skips or repeats
 * rows when several events share a millisecond, which is exactly what a burst of
 * activity produces. The id tiebreak makes the page boundary total.
 */
export interface AuditCursor {
  createdAt: string;
  id: string;
}

export interface AuditEventPage {
  events: EnterpriseAuditEvent[];
  nextCursor: AuditCursor | null;
}

interface AuditEventRow {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  surface: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: 'success' | 'failure' | 'denied';
  severity: 'info' | 'warning' | 'critical';
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const COLUMNS = `id, organization_id, actor_user_id, surface, action, resource_type,
  resource_id, outcome, severity, metadata, created_at`;

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date(0).toISOString();
}

export function formatAuditEvent(row: AuditEventRow): EnterpriseAuditEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    surface: row.surface as EnterpriseAuditEvent['surface'],
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
    severity: row.severity,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
  };
}

/**
 * Builds the shared WHERE clause. Every value is a bound parameter — no filter
 * reaches the SQL text — and `organization_id` is always pinned first so a
 * missing filter can never widen the query past one workspace. RLS
 * (`enterprise_audit_events_admin_read`) is the backstop, not the only gate.
 */
function buildPredicate(
  organizationId: string,
  filters: AuditEventFilters,
  cursor?: AuditCursor,
): { where: string; params: unknown[] } {
  const params: unknown[] = [organizationId];
  const clauses = ['organization_id = $1'];
  const bind = (value: unknown): string => `$${params.push(value)}`;

  if (filters.actorUserId) clauses.push(`actor_user_id = ${bind(filters.actorUserId)}`);
  if (filters.action) clauses.push(`action = ${bind(filters.action)}`);
  if (filters.resourceType) clauses.push(`resource_type = ${bind(filters.resourceType)}`);
  if (filters.outcome) clauses.push(`outcome = ${bind(filters.outcome)}`);
  if (filters.severity) clauses.push(`severity = ${bind(filters.severity)}`);
  if (filters.from) clauses.push(`created_at >= ${bind(filters.from)}::timestamptz`);
  if (filters.to) clauses.push(`created_at <= ${bind(filters.to)}::timestamptz`);

  if (cursor) {
    const at = bind(cursor.createdAt);
    const id = bind(cursor.id);
    clauses.push(`(created_at, id) < (${at}::timestamptz, ${id}::uuid)`);
  }

  return { where: clauses.join(' and '), params };
}

export async function listAuditEvents(
  db: DatabaseAdapter,
  organizationId: string,
  filters: AuditEventFilters = {},
  options: { limit?: number; cursor?: AuditCursor } = {},
): Promise<AuditEventPage> {
  const limit = Math.min(
    Math.max(options.limit ?? AUDIT_PAGE_SIZE_DEFAULT, 1),
    AUDIT_PAGE_SIZE_MAX,
  );
  const { where, params } = buildPredicate(organizationId, filters, options.cursor);

  // One extra row decides whether another page exists, without a second count
  // query that would disagree with this one under concurrent writes.
  const rows = await db.query<AuditEventRow>(
    `select ${COLUMNS}
       from public.enterprise_audit_events
      where ${where}
      order by created_at desc, id desc
      limit ${limit + 1}`,
    params,
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return {
    events: page.map(formatAuditEvent),
    nextCursor: hasMore && last ? { createdAt: toIso(last.created_at), id: last.id } : null,
  };
}

/**
 * Yields the full filtered set in batches, oldest-visible page first within the
 * same (created_at DESC, id DESC) order the reader uses.
 *
 * Keyset paging rather than OFFSET: an export can run for many pages while new
 * events arrive, and OFFSET would shift under every insert, dropping rows out of
 * the middle of a compliance extract without any error.
 */
export async function* iterateAuditEventsForExport(
  db: DatabaseAdapter,
  organizationId: string,
  filters: AuditEventFilters = {},
  batchSize: number = AUDIT_EXPORT_BATCH,
): AsyncGenerator<EnterpriseAuditEvent[]> {
  let cursor: AuditCursor | undefined;

  for (;;) {
    const { where, params } = buildPredicate(organizationId, filters, cursor);
    const rows = await db.query<AuditEventRow>(
      `select ${COLUMNS}
         from public.enterprise_audit_events
        where ${where}
        order by created_at desc, id desc
        limit ${batchSize}`,
      params,
    );

    if (rows.length === 0) return;
    yield rows.map(formatAuditEvent);
    if (rows.length < batchSize) return;

    const last = rows[rows.length - 1];
    if (!last) return;
    cursor = { createdAt: toIso(last.created_at), id: last.id };
  }
}

/** Distinct values an admin can filter by, so the UI offers real options only. */
export async function listAuditFacets(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<{ actions: string[]; resourceTypes: string[]; actors: string[] }> {
  const rows = await db.query<{ kind: string; value: string }>(
    `select 'action' as kind, action as value
       from public.enterprise_audit_events where organization_id = $1
      union
     select 'resource_type', resource_type
       from public.enterprise_audit_events where organization_id = $1
      union
     select 'actor', actor_user_id
       from public.enterprise_audit_events
      where organization_id = $1 and actor_user_id is not null
      order by 1, 2
      limit 500`,
    [organizationId],
  );

  return {
    actions: rows.filter((r) => r.kind === 'action').map((r) => r.value),
    resourceTypes: rows.filter((r) => r.kind === 'resource_type').map((r) => r.value),
    actors: rows.filter((r) => r.kind === 'actor').map((r) => r.value),
  };
}
