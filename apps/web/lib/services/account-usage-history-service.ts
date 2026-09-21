import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  BREAKDOWN_LIMIT,
  OUT_TOKENS,
  SETTLED,
  TOKENS,
  UNSETTLED,
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
 * One account's own settled usage, day by day and broken down by what produced
 * it.
 *
 * The meters on Settings > Usage answer "how much is left in each window".
 * They cannot answer "what did I spend it on", which is the question someone
 * asks the moment a meter surprises them, and until this existed the only
 * surface that could answer it was the workspace console, which a person on a
 * personal plan has no access to.
 *
 * Read from `managed_usage_requests` by the same predicates the workspace
 * console uses, so the two surfaces cannot disagree about one turn. Only what
 * the account spent: never a prompt, a completion or a conversation title.
 */
export interface AccountUsageHistory {
  userId: string;
  from: string;
  to: string;
  totals: UsageTotals;
  daily: UsageDayRow[];
  byWorkload: UsageBreakdownRow[];
  byModel: UsageBreakdownRow[];
  freshness: UsageFreshness;
}

const OWN_SETTLED_ROWS = `
   from public.managed_usage_requests
  where user_id = $1
    and ${SETTLED}
    and created_at >= $2
    and created_at < $3`;

async function aggregateBy(
  db: DatabaseAdapter,
  userId: string,
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
     ${OWN_SETTLED_ROWS}
    group by 1
    order by cost_cents desc, requests desc
    limit ${BREAKDOWN_LIMIT}`,
    [userId, from, to],
  );
  return rows.map(toRow);
}

export async function readAccountUsageHistory(
  db: DatabaseAdapter,
  userId: string,
  window: { from: string; to: string },
): Promise<AccountUsageHistory> {
  const { from, to } = window;

  const [totalsRows, dailyRows, byWorkload, byModel, freshnessRows] = await Promise.all([
    db.query<AggregateRow>(
      `select null as key,
              count(*)::int as requests,
              sum(${TOKENS})::bigint as input_tokens,
              sum(${OUT_TOKENS})::bigint as output_tokens,
              sum(coalesce(actual_cost_cents, 0))::bigint as cost_cents
       ${OWN_SETTLED_ROWS}`,
      [userId, from, to],
    ),
    db.query<DayRow>(
      `select date_trunc('day', created_at) as day,
              count(*)::int as requests,
              sum(coalesce(actual_cost_cents, 0))::bigint as cost_cents
       ${OWN_SETTLED_ROWS}
      group by 1
      order by 1 asc`,
      [userId, from, to],
    ),
    aggregateBy(db, userId, from, to, `usage->>'workload'`),
    aggregateBy(db, userId, from, to, 'model'),
    db.query<FreshnessRow>(
      `select max(created_at) filter (where ${SETTLED}) as latest_activity_at,
              count(*) filter (where ${UNSETTLED})::int as unsettled_requests
         from public.managed_usage_requests
        where user_id = $1
          and created_at >= $2
          and created_at < $3`,
      [userId, from, to],
    ),
  ]);

  return {
    userId,
    from,
    to,
    totals: toTotals(totalsRows[0]),
    daily: toDays(dailyRows),
    byWorkload,
    byModel,
    freshness: toFreshness(freshnessRows[0]),
  };
}
