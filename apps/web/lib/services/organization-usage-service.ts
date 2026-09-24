import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import type { UsageWorkload } from '@/lib/billing/usage-attribution';
import {
  BREAKDOWN_LIMIT,
  OUT_TOKENS,
  SETTLED,
  TOKENS,
  UNSETTLED,
  num,
  toDays,
  toFreshness,
  toRow,
  toTotals,
  type AggregateRow,
  type DayRow,
  type FreshnessRow,
  type UsageBreakdownRow,
  type UsageDayRow,
  type UsageFreshness,
  type UsageTotals,
} from '@/lib/services/usage-aggregation';

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

export type {
  UsageBreakdownRow,
  UsageDayRow,
  UsageFreshness,
  UsageTotals,
} from '@/lib/services/usage-aggregation';

export interface WorkloadSessionUsage {
  workload: UsageWorkload;
  sessions: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
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
  byWorkload: UsageBreakdownRow[];
  byProject: UsageBreakdownRow[];
  workSessions: WorkloadSessionUsage;
  codeSessions: WorkloadSessionUsage;
  daily: UsageDayRow[];
  freshness: UsageFreshness;
}

export {
  USAGE_DEFAULT_WINDOW_DAYS,
  USAGE_MAX_WINDOW_DAYS,
  resolveUsageWindow,
} from '@/lib/services/usage-aggregation';

interface WorkloadRow extends AggregateRow {
  sessions: string | number | null;
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

  return {
    organizationId,
    from,
    to,
    totals: toTotals(totalsRows[0]),
    byMember,
    byModel,
    byProvider,
    byWorkload,
    byProject,
    workSessions: workloadUsage(workloadSessions, 'work'),
    codeSessions: workloadUsage(workloadSessions, 'code'),
    daily: toDays(dailyRows),
    freshness: toFreshness(freshnessRows[0]),
  };
}
