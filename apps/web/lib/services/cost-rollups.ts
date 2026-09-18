import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MICROUSD_PER_CENT } from '@agiworkforce/types';

import { USAGE_WORKLOADS, type UsageWorkload } from '@/lib/billing/usage-attribution';
import { getNeonDb } from '@/lib/server/neon-db';
import { COGS_CAPABILITIES, type CogsCapability } from '@/lib/services/cogs-ledger-service';

export const COST_ROLLUP_DIMENSIONS = ['workspace', 'capability', 'workload', 'day'] as const;
export type CostRollupDimension = (typeof COST_ROLLUP_DIMENSIONS)[number];

export function isCostRollupDimension(value: string): value is CostRollupDimension {
  return (COST_ROLLUP_DIMENSIONS as readonly string[]).includes(value);
}

const UNATTRIBUTED_KEY = 'unattributed';

const DIMENSION_EXPRESSION: Readonly<Record<CostRollupDimension, string>> = {
  workspace: `coalesce(e.workspace_id, e.organization_id, '${UNATTRIBUTED_KEY}')`,
  capability: 'e.capability',
  workload: `coalesce(e.workload, '${UNATTRIBUTED_KEY}')`,
  day: "to_char(date_trunc('day', e.occurred_at at time zone 'UTC'), 'YYYY-MM-DD')",
};

export interface CostRollupRow {
  readonly key: string;
  readonly events: number;
  readonly providerCostMicrousd: number;
  readonly customerValueMicrousd: number;
  readonly cacheHits: number;
  readonly cacheAvoidedMicrousd: number;
  readonly cacheSavingsMicrousd: number;
  readonly cacheSavingsShare: number | null;
}

export interface CostRollup {
  readonly from: string;
  readonly to: string;
  readonly dimension: CostRollupDimension;
  readonly rows: readonly CostRollupRow[];
  readonly totals: CostRollupRow;
}

interface RollupQueryRow {
  readonly key: string | null;
  readonly events: string | number | null;
  readonly provider_microusd: string | number | null;
  readonly customer_microusd: string | number | null;
  readonly cache_hits: string | number | null;
  readonly avoided_microusd: string | number | null;
  readonly cache_savings_cents: string | number | null;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rollupQuery(dimension: CostRollupDimension): string {
  return `select
       ${DIMENSION_EXPRESSION[dimension]} as key,
       count(*) as events,
       coalesce(sum(e.provider_estimated_cost_microusd), 0) as provider_microusd,
       coalesce(sum(e.customer_canonical_microusd), 0) as customer_microusd,
       count(*) filter (where e.cache_hit) as cache_hits,
       coalesce(sum(e.avoided_cost_microusd), 0) as avoided_microusd,
       coalesce(sum(e.cache_savings_cents), 0) as cache_savings_cents
     from public.provider_cost_events e
     where e.occurred_at >= $1 and e.occurred_at < $2
     group by 1
     order by 3 desc`;
}

/**
 * What a cache did not spend. `avoided_cost_microusd` is the call that never
 * happened; `cache_savings_cents` is the discount on a call that did. They are
 * different mechanisms and summing them into one figure would double-count
 * neither, so both are carried.
 */
function toRow(key: string, row: RollupQueryRow): CostRollupRow {
  const providerCostMicrousd = toNumber(row.provider_microusd);
  const cacheAvoidedMicrousd = toNumber(row.avoided_microusd);
  const cacheSavingsMicrousd = toNumber(row.cache_savings_cents) * MICROUSD_PER_CENT;
  const saved = cacheAvoidedMicrousd + cacheSavingsMicrousd;
  const wouldHaveSpent = providerCostMicrousd + saved;
  return {
    key,
    events: toNumber(row.events),
    providerCostMicrousd,
    customerValueMicrousd: toNumber(row.customer_microusd),
    cacheHits: toNumber(row.cache_hits),
    cacheAvoidedMicrousd,
    cacheSavingsMicrousd,
    cacheSavingsShare: wouldHaveSpent > 0 ? saved / wouldHaveSpent : null,
  };
}

function sumRows(rows: readonly CostRollupRow[]): CostRollupRow {
  const totals = rows.reduce(
    (accumulator, row) => ({
      events: accumulator.events + row.events,
      providerCostMicrousd: accumulator.providerCostMicrousd + row.providerCostMicrousd,
      customerValueMicrousd: accumulator.customerValueMicrousd + row.customerValueMicrousd,
      cacheHits: accumulator.cacheHits + row.cacheHits,
      cacheAvoidedMicrousd: accumulator.cacheAvoidedMicrousd + row.cacheAvoidedMicrousd,
      cacheSavingsMicrousd: accumulator.cacheSavingsMicrousd + row.cacheSavingsMicrousd,
    }),
    {
      events: 0,
      providerCostMicrousd: 0,
      customerValueMicrousd: 0,
      cacheHits: 0,
      cacheAvoidedMicrousd: 0,
      cacheSavingsMicrousd: 0,
    },
  );
  const saved = totals.cacheAvoidedMicrousd + totals.cacheSavingsMicrousd;
  const wouldHaveSpent = totals.providerCostMicrousd + saved;
  return {
    key: 'total',
    ...totals,
    cacheSavingsShare: wouldHaveSpent > 0 ? saved / wouldHaveSpent : null,
  };
}

export async function readCostRollup(input: {
  from: Date;
  to: Date;
  dimension: CostRollupDimension;
  db?: DatabaseAdapter;
}): Promise<CostRollup> {
  const db = input.db ?? getNeonDb();
  const queried = await db.query<RollupQueryRow>(rollupQuery(input.dimension), [
    input.from,
    input.to,
  ]);
  const rows = queried.map((row) => toRow(row.key ?? UNATTRIBUTED_KEY, row));

  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    dimension: input.dimension,
    rows,
    totals: sumRows(rows),
  };
}

export const DEFAULT_LOOP_EVENT_THRESHOLD = 25;
export const DEFAULT_LOOP_WINDOW_MINUTES = 15;

export interface CostLoopSuspect {
  readonly operationId: string;
  readonly scope: 'task' | 'session';
  readonly events: number;
  readonly distinctMinutes: number;
  readonly spentMicrousd: number;
  readonly deliveredEvents: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
}

interface LoopQueryRow {
  readonly operation_id: string | null;
  readonly scope: string | null;
  readonly events: string | number | null;
  readonly distinct_minutes: string | number | null;
  readonly spent_microusd: string | number | null;
  readonly delivered_events: string | number | null;
  readonly first_seen: Date | string | null;
  readonly last_seen: Date | string | null;
}

// A run that keeps paying a provider and delivers nothing is the shape a loop
// has in the ledger. task_ref and session_id are the operation ids the cost
// events carry, so the same run is counted once under whichever it recorded.
const LOOP_QUERY = `with scoped as (
     select coalesce(e.task_ref, e.session_id) as operation_id,
            case when e.task_ref is not null then 'task' else 'session' end as scope,
            e.occurred_at,
            e.provider_estimated_cost_microusd,
            e.task_outcome
       from public.provider_cost_events e
      where e.occurred_at >= $1
        and (e.task_ref is not null or e.session_id is not null)
   )
   select operation_id,
          min(scope) as scope,
          count(*) as events,
          count(distinct date_trunc('minute', occurred_at)) as distinct_minutes,
          coalesce(sum(provider_estimated_cost_microusd), 0) as spent_microusd,
          count(*) filter (where task_outcome = 'delivered') as delivered_events,
          min(occurred_at) as first_seen,
          max(occurred_at) as last_seen
     from scoped
    group by operation_id
   having count(*) >= $2
    order by count(*) desc
    limit $3`;

const LOOP_SUSPECT_LIMIT = 50;

function toIsoString(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? new Date(value).toISOString() : new Date(0).toISOString();
}

/**
 * Operations that spent repeatedly inside one window. A long multi-step task is
 * expected to cost a lot, so the report carries how many of its events
 * delivered something: a caller judges a loop by that, and nothing here stops a
 * run.
 */
export async function detectCostLoops(input?: {
  now?: Date;
  windowMinutes?: number;
  eventThreshold?: number;
  db?: DatabaseAdapter;
}): Promise<readonly CostLoopSuspect[]> {
  const db = input?.db ?? getNeonDb();
  const windowMinutes = Math.max(
    1,
    Math.trunc(input?.windowMinutes ?? DEFAULT_LOOP_WINDOW_MINUTES),
  );
  const threshold = Math.max(2, Math.trunc(input?.eventThreshold ?? DEFAULT_LOOP_EVENT_THRESHOLD));
  const since = new Date((input?.now ?? new Date()).getTime() - windowMinutes * 60_000);

  const rows = await db.query<LoopQueryRow>(LOOP_QUERY, [since, threshold, LOOP_SUSPECT_LIMIT]);
  return rows
    .filter((row) => typeof row.operation_id === 'string' && row.operation_id.length > 0)
    .map((row) => ({
      operationId: row.operation_id as string,
      scope: row.scope === 'task' ? ('task' as const) : ('session' as const),
      events: toNumber(row.events),
      distinctMinutes: toNumber(row.distinct_minutes),
      spentMicrousd: toNumber(row.spent_microusd),
      deliveredEvents: toNumber(row.delivered_events),
      firstSeen: toIsoString(row.first_seen),
      lastSeen: toIsoString(row.last_seen),
    }));
}

export interface CostOperationsReport {
  readonly rollup: CostRollup;
  readonly loopSuspects: readonly CostLoopSuspect[];
  readonly capabilities: readonly CogsCapability[];
  readonly workloads: readonly UsageWorkload[];
}

export async function readCostOperations(input: {
  from: Date;
  to: Date;
  dimension: CostRollupDimension;
  now?: Date;
  windowMinutes?: number;
  eventThreshold?: number;
  db?: DatabaseAdapter;
}): Promise<CostOperationsReport> {
  const db = input.db ?? getNeonDb();
  const [rollup, loopSuspects] = await Promise.all([
    readCostRollup({ ...input, db }),
    detectCostLoops({ ...input, db }),
  ]);

  return {
    rollup,
    loopSuspects,
    capabilities: COGS_CAPABILITIES,
    workloads: USAGE_WORKLOADS,
  };
}
