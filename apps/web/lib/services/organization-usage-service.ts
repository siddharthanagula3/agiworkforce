import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

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

export interface OrganizationUsage {
  organizationId: string;
  from: string;
  to: string;
  totals: UsageTotals;
  byMember: UsageBreakdownRow[];
  byModel: UsageBreakdownRow[];
  byProvider: UsageBreakdownRow[];
  daily: UsageDayRow[];
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

const TOKENS = `
  coalesce((usage->>'input_tokens')::numeric, (usage->>'prompt_tokens')::numeric, 0)`;
const OUT_TOKENS = `
  coalesce((usage->>'output_tokens')::numeric, (usage->>'completion_tokens')::numeric, 0)`;

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

  const [totalsRows, byMember, byModel, byProvider, dailyRows] = await Promise.all([
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
    daily: dailyRows.map((row) => ({
      day: row.day instanceof Date ? row.day.toISOString() : String(row.day),
      requests: num(row.requests),
      costCents: num(row.cost_cents),
    })),
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
