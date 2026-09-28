import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ACCOUNT_USAGE_HISTORY_GRANULARITIES,
  creditsFromMicrousd,
  rateCardUsageLabel,
  type AccountUsageBreakdownRow,
  type AccountUsageHistoryGranularity,
  type AccountUsageHistoryResponse,
  type AccountUsageTotals,
  type ManagedUsageTurnCost,
  type MonthlyImageUsage,
} from '@agiworkforce/types';

import {
  BREAKDOWN_LIMIT,
  OUT_TOKENS,
  SETTLED,
  TOKENS,
  UNSETTLED,
  num,
  toFreshness,
  toIsoOrNull,
  type FreshnessRow,
} from '@/lib/services/usage-aggregation';

export type UsageHistoryGranularity = AccountUsageHistoryGranularity;

export const USAGE_HISTORY_PERIOD_COUNT: Readonly<Record<UsageHistoryGranularity, number>> = {
  day: 30,
  week: 12,
  month: 12,
};

export const USAGE_EXPORT_ROW_LIMIT = 10_000;

export function resolveUsageHistoryGranularity(value: string | null): UsageHistoryGranularity {
  return ACCOUNT_USAGE_HISTORY_GRANULARITIES.includes(value as UsageHistoryGranularity)
    ? (value as UsageHistoryGranularity)
    : 'day';
}

export function usageHistoryWindowStart(
  granularity: UsageHistoryGranularity,
  now: Date = new Date(),
): Date {
  const periods = USAGE_HISTORY_PERIOD_COUNT[granularity] - 1;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  if (granularity === 'month') return new Date(Date.UTC(year, month - periods, 1));
  if (granularity === 'week') {
    const sinceMonday = (now.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(year, month, day - sinceMonday - periods * 7));
  }
  return new Date(Date.UTC(year, month, day - periods));
}

export interface AccountUsageRecord {
  requestId: string;
  createdAt: string;
  finalizedAt: string | null;
  workload: string | null;
  operation: string | null;
  model: string;
  projectId: string | null;
  projectName: string | null;
  inputTokens: number;
  outputTokens: number;
  credits: number;
}

interface CreditAggregateRow {
  key: string | null;
  label?: string | null;
  requests: string | number | null;
  input_tokens: string | number | null;
  output_tokens: string | number | null;
  cost_microusd: string | number | null;
}

interface PeriodRow {
  period: string | Date;
  requests: string | number | null;
  cost_microusd: string | number | null;
}

interface RecordRow {
  id: string;
  created_at: string | Date;
  finalized_at: string | Date | null;
  workload: string | null;
  operation: string | null;
  model: string;
  project_id: string | null;
  project_name: string | null;
  input_tokens: string | number | null;
  output_tokens: string | number | null;
  cost_microusd: string | number | null;
}

const OWN_SETTLED_ROWS = `
   from public.managed_usage_requests
  where user_id = $1
    and ${SETTLED}
    and created_at >= $2
    and created_at < $3`;

const SUMS = `count(*)::int as requests,
            sum(${TOKENS})::bigint as input_tokens,
            sum(${OUT_TOKENS})::bigint as output_tokens,
            sum(coalesce(actual_cost_microusd, 0))::bigint as cost_microusd`;

function toTotals(row: CreditAggregateRow | undefined): AccountUsageTotals {
  return {
    requests: num(row?.requests),
    inputTokens: num(row?.input_tokens),
    outputTokens: num(row?.output_tokens),
    credits: creditsFromMicrousd(num(row?.cost_microusd)),
  };
}

function toBreakdownRow(row: CreditAggregateRow): AccountUsageBreakdownRow {
  return {
    key: row.key ?? 'unknown',
    label: row.label ?? rateCardUsageLabel(row.key),
    ...toTotals(row),
  };
}

async function aggregateBy(
  db: DatabaseAdapter,
  userId: string,
  window: { from: string; to: string },
  keyExpression: string,
): Promise<AccountUsageBreakdownRow[]> {
  const rows = await db.query<CreditAggregateRow>(
    `select ${keyExpression} as key,
            ${SUMS}
     ${OWN_SETTLED_ROWS}
    group by 1
    order by cost_microusd desc, requests desc
    limit ${BREAKDOWN_LIMIT}`,
    [userId, window.from, window.to],
  );
  return rows.map(toBreakdownRow);
}

async function aggregateByProject(
  db: DatabaseAdapter,
  userId: string,
  window: { from: string; to: string },
): Promise<AccountUsageBreakdownRow[]> {
  const rows = await db.query<CreditAggregateRow>(
    `select own.project_id as key,
            max(project.name) as label,
            count(*)::int as requests,
            sum(own.input_tokens)::bigint as input_tokens,
            sum(own.output_tokens)::bigint as output_tokens,
            sum(own.cost_microusd)::bigint as cost_microusd
       from (
         select usage->>'projectId' as project_id,
                organization_id,
                ${TOKENS} as input_tokens,
                ${OUT_TOKENS} as output_tokens,
                coalesce(actual_cost_microusd, 0) as cost_microusd
         ${OWN_SETTLED_ROWS}
            and usage->>'projectId' is not null
       ) own
       left join public.user_projects project
         on project.id::text = own.project_id
        and project.organization_id is not distinct from own.organization_id
      group by own.project_id
      order by cost_microusd desc, requests desc
      limit ${BREAKDOWN_LIMIT}`,
    [userId, window.from, window.to],
  );
  return rows.map(toBreakdownRow);
}

export async function readAccountUsageHistory(
  db: DatabaseAdapter,
  userId: string,
  window: { from: string; to: string },
  granularity: UsageHistoryGranularity = 'day',
): Promise<AccountUsageHistoryResponse> {
  const params = [userId, window.from, window.to];

  const [totalsRows, periodRows, byWorkload, byModel, byProject, freshnessRows] = await Promise.all(
    [
      db.query<CreditAggregateRow>(`select null as key, ${SUMS} ${OWN_SETTLED_ROWS}`, params),
      db.query<PeriodRow>(
        `select date_trunc($4::text, created_at, 'UTC') as period,
                count(*)::int as requests,
                sum(coalesce(actual_cost_microusd, 0))::bigint as cost_microusd
         ${OWN_SETTLED_ROWS}
        group by 1
        order by 1 asc`,
        [...params, granularity],
      ),
      aggregateBy(db, userId, window, `usage->>'workload'`),
      aggregateBy(db, userId, window, 'model'),
      aggregateByProject(db, userId, window),
      db.query<FreshnessRow>(
        `select max(created_at) filter (where ${SETTLED}) as latest_activity_at,
                count(*) filter (where ${UNSETTLED})::int as unsettled_requests
           from public.managed_usage_requests
          where user_id = $1
            and created_at >= $2
            and created_at < $3`,
        params,
      ),
    ],
  );

  return {
    userId,
    from: window.from,
    to: window.to,
    granularity,
    totals: toTotals(totalsRows[0]),
    periods: periodRows.map((row) => ({
      start: toIsoOrNull(row.period) ?? String(row.period),
      requests: num(row.requests),
      credits: creditsFromMicrousd(num(row.cost_microusd)),
    })),
    byWorkload,
    byModel,
    byProject,
    freshness: toFreshness(freshnessRows[0]),
  };
}

export async function readAccountUsageRecords(
  db: DatabaseAdapter,
  userId: string,
  window: { from: string; to: string },
  options: { requestId?: string; limit?: number } = {},
): Promise<AccountUsageRecord[]> {
  const limit = Math.min(options.limit ?? USAGE_EXPORT_ROW_LIMIT, USAGE_EXPORT_ROW_LIMIT);
  const rows = await db.query<RecordRow>(
    `select own.*, project.name as project_name
       from (
         select id::text as id,
                organization_id,
                created_at,
                finalized_at,
                usage->>'workload' as workload,
                usage->>'operation' as operation,
                model,
                usage->>'projectId' as project_id,
                ${TOKENS} as input_tokens,
                ${OUT_TOKENS} as output_tokens,
                coalesce(actual_cost_microusd, 0) as cost_microusd
         ${OWN_SETTLED_ROWS}
            and ($4::text is null or id::text = $4::text)
          order by created_at desc
          limit ${limit}
       ) own
       left join public.user_projects project
         on project.id::text = own.project_id
        and project.organization_id is not distinct from own.organization_id
      order by own.created_at desc`,
    [userId, window.from, window.to, options.requestId ?? null],
  );
  return rows.map((row) => ({
    requestId: row.id,
    createdAt: toIsoOrNull(row.created_at) ?? String(row.created_at),
    finalizedAt: toIsoOrNull(row.finalized_at),
    workload: row.workload,
    operation: row.operation,
    model: row.model,
    projectId: row.project_id,
    projectName: row.project_name,
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
    credits: creditsFromMicrousd(num(row.cost_microusd)),
  }));
}

export async function readMonthlyImageUsage(
  db: DatabaseAdapter,
  userId: string,
): Promise<MonthlyImageUsage> {
  const rows = await db.query<{
    images: string | number | null;
    requests: string | number | null;
    cost_microusd: string | number | null;
  }>(
    `select coalesce(sum(
              case when usage->>'outputCount' ~ '^[0-9]+$'
                   then (usage->>'outputCount')::int else 0 end
            ), 0)::int as images,
            count(*)::int as requests,
            coalesce(sum(coalesce(actual_cost_microusd, 0)), 0)::bigint as cost_microusd
       from public.managed_usage_requests
      where user_id = $1
        and ${SETTLED}
        and usage->>'operation' = 'image'
        and created_at >= date_trunc('month', now())`,
    [userId],
  );
  const row = rows[0];
  return {
    images: num(row?.images),
    requests: num(row?.requests),
    credits: creditsFromMicrousd(num(row?.cost_microusd)),
  };
}

const SETTLED_TURN_STATUSES: ReadonlySet<string> = new Set(['completed', 'released', 'declined']);

export async function readManagedUsageTurnCost(
  db: DatabaseAdapter,
  userId: string,
  requestId: string,
): Promise<ManagedUsageTurnCost | null> {
  const [row] = await db.query<{ status: string; cost_microusd: string | number | null }>(
    `select status, actual_cost_microusd as cost_microusd
       from public.managed_usage_requests
      where user_id = $1
        and idempotency_key = $2
      limit 1`,
    [userId, requestId],
  );
  if (!row) return null;
  if (!SETTLED_TURN_STATUSES.has(row.status)) {
    return { requestId, status: 'pending', credits: null };
  }
  return { requestId, status: 'settled', credits: creditsFromMicrousd(num(row.cost_microusd)) };
}
