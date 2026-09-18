import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import type { UsageWorkload } from '@/lib/billing/usage-attribution';

/**
 * Workspace usage, read from `managed_usage_requests`.
 *
 * NOT from `organization_usage_ledger`, which is the table this looks like it
 * should use. Nothing writes to that table, only account erasure and financial
 * retention reference it, so a dashboard built on it would report zero forever
 * while looking authoritative. `managed_usage_requests` is where a managed turn
 * actually lands.
 *
 * WHAT IS DELIBERATELY NOT HERE: prompts, completions, conversation titles, or
 * anything a member typed. An administrator gets spend and volume, which is
 * operational insight they need to run a budget. Reading what their staff asked
 * the model is a different power and this surface must not become a way to
 * acquire it.
 *
 * `gross_margin_usd` on the ledger is OUR margin, not the customer's cost. If
 * this ever does read that table, those columns stay out of the response.
 */

export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface UsageBreakdownRow {
  key: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export interface UsageDayRow {
  day: string;
  requests: number;
  costCents: number;
}

export interface WorkloadSessionUsage {
  workload: UsageWorkload;
  sessions: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

/**
 * Why a total can still move. `asOf` is when this answer was computed,
 * `latestActivityAt` is the newest turn it could see, and `unsettledRequests`
 * is the count of turns inside the window that have not settled yet, which is
 * the only reason a figure an administrator reads today can be larger tomorrow.
 */
export interface UsageFreshness {
  asOf: string;
  latestActivityAt: string | null;
  unsettledRequests: number;
}

export interface OrganizationUsage {
  organizationId: string;
  from: string;
  to: string;
  totals: UsageTotals;
  byMember: UsageBreakdownRow[];
  byModel: UsageBreakdownRow[];
  byProvider: UsageBreakdownRow[];
  byWorkload: UsageBreakdownRow[];
  byProject: UsageBreakdownRow[];
  workSessions: WorkloadSessionUsage;
  codeSessions: WorkloadSessionUsage;
  daily: UsageDayRow[];
  freshness: UsageFreshness;
}

/** A window longer than this makes the group-by scan unbounded in practice. */
export const USAGE_MAX_WINDOW_DAYS = 366;
export const USAGE_DEFAULT_WINDOW_DAYS = 30;
const BREAKDOWN_LIMIT = 50;

interface AggregateRow {
  key: string | null;
  requests: string | number | null;
  input_tokens: string | number | null;
  output_tokens: string | number | null;
  cost_cents: string | number | null;
}

interface DayRow {
  day: string | Date;
  requests: string | number | null;
  cost_cents: string | number | null;
}

function num(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
}

function toIsoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toRow(row: AggregateRow): UsageBreakdownRow {
  return {
    key: row.key ?? 'unknown',
    requests: num(row.requests),
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
    costCents: num(row.cost_cents),
  };
}

/**
 * Only settled turns count.
 *
 * A reservation that was declined, released, or is still in flight has not cost
 * the workspace anything, and including it would inflate the number an
 * administrator budgets against. `outcome_unknown` is excluded for the same
 * reason: it is unresolved, not spent.
 */
const SETTLED = `status = 'completed'`;

/**
 * In flight or unresolved, so the settled totals above can still grow. Not
 * `released` or `declined`: those turns are over and will never cost anything.
 */
const UNSETTLED = `status = any (array['reserving', 'reserved', 'provider_started', 'outcome_unknown'])`;

/**
 * Token counts live in the `usage` jsonb rather than in columns. Coalesced to
 * zero so a provider that reported no usage lowers nothing but the token count
 *, its cost still counts.
 */
const TOKENS = `
  coalesce((usage->>'input_tokens')::numeric, (usage->>'prompt_tokens')::numeric, 0)`;
const OUT_TOKENS = `
  coalesce((usage->>'output_tokens')::numeric, (usage->>'completion_tokens')::numeric, 0)`;

interface WorkloadRow extends AggregateRow {
  sessions: string | number | null;
}

interface FreshnessRow {
  latest_activity_at: string | Date | null;
  unsettled_requests: string | number | null;
}

async function aggregateWorkloadSessions(
  db: DatabaseAdapter,
  organizationId: string,
  from: string,
  to: string,
): Promise<Map<string, WorkloadSessionUsage>> {
  const rows = await db.query<WorkloadRow>(
    `select usage->>'workload' as key,
            count(distinct usage->>'sessionId')::int as sessions,
            count(*)::int as requests,
            sum(${TOKENS})::bigint as input_tokens,
            sum(${OUT_TOKENS})::bigint as output_tokens,
            sum(coalesce(actual_cost_cents, 0))::bigint as cost_cents
       from public.managed_usage_requests
      where organization_id = $1
        and ${SETTLED}
        and created_at >= $2
        and created_at < $3
        and usage->>'workload' is not null
      group by 1
      limit ${BREAKDOWN_LIMIT}`,
    [organizationId, from, to],
  );

  return new Map(
    rows.map((row) => [
      row.key ?? '',
      {
        workload: (row.key ?? '') as UsageWorkload,
        sessions: num(row.sessions),
        requests: num(row.requests),
        inputTokens: num(row.input_tokens),
        outputTokens: num(row.output_tokens),
        costCents: num(row.cost_cents),
      },
    ]),
  );
}

function workloadUsage(
  sessions: Map<string, WorkloadSessionUsage>,
  workload: UsageWorkload,
): WorkloadSessionUsage {
  return (
    sessions.get(workload) ?? {
      workload,
      sessions: 0,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
    }
  );
}

async function aggregateBy(
  db: DatabaseAdapter,
  organizationId: string,
  from: string,
  to: string,
  keyExpression: string,
): Promise<UsageBreakdownRow[]> {
  const rows = await db.query<AggregateRow>(
    `select ${keyExpression} as key,
            count(*)::int as requests,
            sum(${TOKENS})::bigint as input_tokens,
            sum(${OUT_TOKENS})::bigint as output_tokens,
            sum(coalesce(actual_cost_cents, 0))::bigint as cost_cents
       from public.managed_usage_requests
      where organization_id = $1
        and ${SETTLED}
        and created_at >= $2
        and created_at < $3
      group by 1
      order by cost_cents desc, requests desc
      limit ${BREAKDOWN_LIMIT}`,
    [organizationId, from, to],
  );
  return rows.map(toRow);
}

export async function readOrganizationUsage(
  db: DatabaseAdapter,
  organizationId: string,
  window: { from: string; to: string },
): Promise<OrganizationUsage> {
  const { from, to } = window;

  const [
    totalsRows,
    byMember,
    byModel,
    byProvider,
    byWorkload,
    byProject,
    workloadSessions,
    dailyRows,
    freshnessRows,
  ] = await Promise.all([
    db.query<AggregateRow>(
      `select null as key,
              count(*)::int as requests,
              sum(${TOKENS})::bigint as input_tokens,
              sum(${OUT_TOKENS})::bigint as output_tokens,
              sum(coalesce(actual_cost_cents, 0))::bigint as cost_cents
         from public.managed_usage_requests
        where organization_id = $1
          and ${SETTLED}
          and created_at >= $2
          and created_at < $3`,
      [organizationId, from, to],
    ),
    aggregateBy(db, organizationId, from, to, 'user_id'),
    aggregateBy(db, organizationId, from, to, 'model'),
    aggregateBy(db, organizationId, from, to, 'provider'),
    aggregateBy(db, organizationId, from, to, `usage->>'workload'`),
    aggregateBy(db, organizationId, from, to, `usage->>'projectId'`),
    aggregateWorkloadSessions(db, organizationId, from, to),
    db.query<DayRow>(
      `select date_trunc('day', created_at) as day,
              count(*)::int as requests,
              sum(coalesce(actual_cost_cents, 0))::bigint as cost_cents
         from public.managed_usage_requests
        where organization_id = $1
          and ${SETTLED}
          and created_at >= $2
          and created_at < $3
        group by 1
        order by 1 asc`,
      [organizationId, from, to],
    ),
    db.query<FreshnessRow>(
      `select max(created_at) filter (where ${SETTLED}) as latest_activity_at,
              count(*) filter (where ${UNSETTLED})::int as unsettled_requests
         from public.managed_usage_requests
        where organization_id = $1
          and created_at >= $2
          and created_at < $3`,
      [organizationId, from, to],
    ),
  ]);

  const totals = totalsRows[0]
    ? toRow(totalsRows[0])
    : { key: 'total', requests: 0, inputTokens: 0, outputTokens: 0, costCents: 0 };

  return {
    organizationId,
    from,
    to,
    totals: {
      requests: totals.requests,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      costCents: totals.costCents,
    },
    byMember,
    byModel,
    byProvider,
    byWorkload,
    byProject,
    workSessions: workloadUsage(workloadSessions, 'work'),
    codeSessions: workloadUsage(workloadSessions, 'code'),
    daily: dailyRows.map((row) => ({
      day: row.day instanceof Date ? row.day.toISOString() : String(row.day),
      requests: num(row.requests),
      costCents: num(row.cost_cents),
    })),
    freshness: {
      asOf: new Date().toISOString(),
      latestActivityAt: toIsoOrNull(freshnessRows[0]?.latest_activity_at ?? null),
      unsettledRequests: num(freshnessRows[0]?.unsettled_requests),
    },
  };
}

/**
 * Clamps a requested window.
 *
 * An open-ended range would let one admin request a group-by over every row the
 * workspace has ever produced, on the same connection that serves live turns.
 */
export function resolveUsageWindow(
  fromParam: string | null,
  toParam: string | null,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = toParam ? new Date(toParam) : now;
  const safeTo = Number.isNaN(to.getTime()) ? now : to;

  const requestedFrom = fromParam ? new Date(fromParam) : null;
  const defaultFrom = new Date(safeTo.getTime() - USAGE_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const from =
    requestedFrom && !Number.isNaN(requestedFrom.getTime()) ? requestedFrom : defaultFrom;

  const earliest = new Date(safeTo.getTime() - USAGE_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const clampedFrom = from < earliest ? earliest : from;

  return {
    from: (clampedFrom > safeTo ? safeTo : clampedFrom).toISOString(),
    to: safeTo.toISOString(),
  };
}
