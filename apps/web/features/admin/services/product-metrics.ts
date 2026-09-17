import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  BILLING_PLAN_PRICING,
  MICROUSD_PER_CENT,
  MICROUSD_PER_USD,
  isBillingPlanTier,
  type ProductMetricKey,
  type ProductMetricValue,
} from '@agiworkforce/types';

import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/constants';
import { getNeonDb } from '@/lib/server/neon-db';
import { readEconomicsSummary } from '@/features/admin/services/economics-summary';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTHS_PER_YEAR = 12;
const SUPPORT_ADJUSTMENT_KIND = 'support_adjustment';
const PAID_SUBSCRIBERS_METRIC: ProductMetricKey = 'paid_subscribers';

export interface ProductMetricsInput {
  readonly from: Date;
  readonly to: Date;
  readonly db?: DatabaseAdapter;
}

export interface ProductMetricsSummary {
  readonly from: string;
  readonly to: string;
  readonly metrics: readonly ProductMetricValue[];
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function measure(
  metric: ProductMetricKey,
  numerator: number,
  denominator: number,
): ProductMetricValue {
  return {
    metric,
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

function absolute(metric: ProductMetricKey, numerator: number): ProductMetricValue {
  return { metric, numerator, denominator: 0, value: numerator };
}

const ACTIVE_USERS_QUERY = `select count(distinct user_id) as users
  from public.product_analytics_events
 where user_id is not null
   and occurred_at >= $1 and occurred_at < $2`;

async function activeUsers(db: DatabaseAdapter, from: Date, to: Date): Promise<number> {
  const rows = await db.query<{ users: string | number }>(ACTIVE_USERS_QUERY, [
    from.toISOString(),
    to.toISOString(),
  ]);
  return toNumber(rows[0]?.users);
}

/**
 * A cohort is the accounts created on one day, and the day is chosen so the
 * window it is measured over has already closed: measuring D30 against a cohort
 * that signed up yesterday would report a retention of zero that is really an
 * absence of elapsed time.
 */
const RETENTION_QUERY = `with cohort as (
    select id
      from public.profiles
     where created_at >= $1 and created_at < $2
  ),
  returned as (
    select distinct e.user_id
      from public.product_analytics_events e
      join cohort c on c.id = e.user_id
     where e.occurred_at >= $3 and e.occurred_at < $4
  )
  select
    (select count(*) from cohort) as cohort_size,
    (select count(*) from returned) as returned_users`;

async function retention(
  db: DatabaseAdapter,
  metric: ProductMetricKey,
  to: Date,
  days: number,
): Promise<ProductMetricValue> {
  const cohortStart = new Date(to.getTime() - (days + 1) * MS_PER_DAY);
  const cohortEnd = new Date(cohortStart.getTime() + MS_PER_DAY);
  const windowStart = new Date(cohortStart.getTime() + days * MS_PER_DAY);
  const windowEnd = new Date(windowStart.getTime() + MS_PER_DAY);

  const rows = await db.query<{
    cohort_size: string | number;
    returned_users: string | number;
  }>(RETENTION_QUERY, [
    cohortStart.toISOString(),
    cohortEnd.toISOString(),
    windowStart.toISOString(),
    windowEnd.toISOString(),
  ]);
  return measure(metric, toNumber(rows[0]?.returned_users), toNumber(rows[0]?.cohort_size));
}

const CONVERSION_QUERY = `with signups as (
    select id from public.profiles where created_at >= $1 and created_at < $2
  )
  select
    (select count(*) from signups) as signups,
    (select count(*)
       from public.subscriptions s
       join signups g on g.id = s.user_id
      where s.status = any($3::text[]) and s.plan_tier <> 'free') as converted`;

const CHURN_QUERY = `select count(*) as churned
  from public.subscriptions
 where canceled_at >= $1 and canceled_at < $2`;

const PAID_SUBSCRIBERS_QUERY = `select count(*) as subscribers
  from public.subscriptions
 where status = any($1::text[]) and plan_tier <> 'free'`;

const PLAN_MIX_QUERY = `select plan_tier, count(*) as subscribers
  from public.subscriptions
 where status = any($1::text[]) and plan_tier <> 'free'
 group by plan_tier`;

const PLAN_CHANGE_QUERY = `select
    properties ->> 'planTier' as plan_tier,
    properties ->> 'previousPlanTier' as previous_plan_tier,
    count(*) as changes
  from public.product_analytics_events
 where event_name = 'plan_changed'
   and occurred_at >= $1 and occurred_at < $2
 group by 1, 2`;

const SUPPORT_COST_QUERY = `select coalesce(sum(amount_cents), 0) as amount_cents
  from public.cogs_adjustments
 where occurred_at >= $1 and occurred_at < $2 and kind = $3`;

const SNAPSHOT_QUERY = `select numerator
  from public.product_metric_days
 where metric = $1 and scope = 'all' and metric_day <= $2::date
 order by metric_day desc
 limit 1`;

const QUALITY_QUERY = `select
    event_name,
    outcome,
    coalesce((properties ->> 'attempt')::int, 1) as attempt,
    count(*) as events
  from public.product_analytics_events
 where occurred_at >= $1 and occurred_at < $2
 group by 1, 2, 3`;

function monthlyPriceMicrousd(planTier: string | null | undefined): number {
  if (!planTier || !isBillingPlanTier(planTier)) return 0;
  const pricing = BILLING_PLAN_PRICING[planTier];
  return 'monthlyPriceUsd' in pricing ? pricing.monthlyPriceUsd * MICROUSD_PER_USD : 0;
}

interface QualityRow {
  event_name: string;
  outcome: string | null;
  attempt: number | string | null;
  events: string | number;
}

interface QualityRate {
  readonly metric: ProductMetricKey;
  readonly numeratorEvent: string;
  readonly denominatorEvent: string;
  readonly outcomes?: readonly string[];
  readonly retriesOnly?: boolean;
}

const QUALITY_RATES: readonly QualityRate[] = [
  {
    metric: 'regenerate_rate',
    numeratorEvent: 'response_regenerated',
    denominatorEvent: 'assistant_response',
  },
  {
    metric: 'stop_rate',
    numeratorEvent: 'generation_stopped',
    denominatorEvent: 'assistant_response',
  },
  {
    metric: 'tool_failure_rate',
    numeratorEvent: 'tool_call',
    denominatorEvent: 'tool_call',
    outcomes: ['failed'],
  },
  {
    metric: 'tool_retry_rate',
    numeratorEvent: 'tool_call',
    denominatorEvent: 'tool_call',
    retriesOnly: true,
  },
  {
    metric: 'citation_failure_rate',
    numeratorEvent: 'citation_rendered',
    denominatorEvent: 'citation_rendered',
    outcomes: ['failed'],
  },
  {
    metric: 'file_failure_rate',
    numeratorEvent: 'file_processed',
    denominatorEvent: 'file_processed',
    outcomes: ['failed'],
  },
  {
    metric: 'code_acceptance_rate',
    numeratorEvent: 'code_suggestion_resolved',
    denominatorEvent: 'code_suggestion_resolved',
    outcomes: ['accepted'],
  },
  {
    metric: 'work_completion_rate',
    numeratorEvent: 'work_run_finished',
    denominatorEvent: 'work_run_finished',
    outcomes: ['succeeded'],
  },
  {
    metric: 'research_completion_rate',
    numeratorEvent: 'research_run_finished',
    denominatorEvent: 'research_run_finished',
    outcomes: ['succeeded'],
  },
  {
    metric: 'browser_success_rate',
    numeratorEvent: 'browser_action_finished',
    denominatorEvent: 'browser_action_finished',
    outcomes: ['succeeded'],
  },
  {
    metric: 'remote_success_rate',
    numeratorEvent: 'remote_action_finished',
    denominatorEvent: 'remote_action_finished',
    outcomes: ['succeeded'],
  },
];

export function qualityMetrics(rows: readonly QualityRow[]): ProductMetricValue[] {
  return QUALITY_RATES.map((rate) => {
    let numerator = 0;
    let denominator = 0;
    for (const row of rows) {
      const count = toNumber(row.events);
      if (row.event_name === rate.denominatorEvent) denominator += count;
      if (row.event_name !== rate.numeratorEvent) continue;
      if (rate.retriesOnly) {
        if (toNumber(row.attempt) > 1) numerator += count;
        continue;
      }
      if (rate.outcomes && !rate.outcomes.includes(row.outcome ?? '')) continue;
      numerator += count;
    }
    return measure(rate.metric, numerator, denominator);
  });
}

async function readSnapshot(
  db: DatabaseAdapter,
  metric: string,
  onOrBefore: Date,
): Promise<number | null> {
  const rows = await db.query<{ numerator: string | number }>(SNAPSHOT_QUERY, [
    metric,
    onOrBefore.toISOString(),
  ]);
  return rows.length === 0 ? null : toNumber(rows[0]?.numerator);
}

/**
 * Every figure here is measured from rows the product already holds: the event
 * stream for engagement and quality, `profiles` and `subscriptions` for the
 * funnel, and the economics summary for revenue and COGS. Nothing is modelled,
 * assumed or carried over from a spreadsheet, and a metric whose denominator is
 * zero reports null rather than a number that would read as a result.
 */
export async function readProductMetrics(
  input: ProductMetricsInput,
): Promise<ProductMetricsSummary> {
  const db = input.db ?? getNeonDb();
  const { from, to } = input;
  const statuses = ACTIVE_SUBSCRIPTION_STATUSES;

  const [daily, weekly, monthly] = await Promise.all([
    activeUsers(db, new Date(to.getTime() - MS_PER_DAY), to),
    activeUsers(db, new Date(to.getTime() - 7 * MS_PER_DAY), to),
    activeUsers(db, new Date(to.getTime() - 30 * MS_PER_DAY), to),
  ]);

  const [d1, d7, d30] = await Promise.all([
    retention(db, 'retention_d1', to, 1),
    retention(db, 'retention_d7', to, 7),
    retention(db, 'retention_d30', to, 30),
  ]);

  const [conversionRows, churnRows, planMixRows, planChangeRows, supportRows] = await Promise.all([
    db.query<{ signups: string | number; converted: string | number }>(CONVERSION_QUERY, [
      from.toISOString(),
      to.toISOString(),
      statuses,
    ]),
    db.query<{ churned: string | number }>(CHURN_QUERY, [from.toISOString(), to.toISOString()]),
    db.query<{ plan_tier: string | null; subscribers: string | number }>(PLAN_MIX_QUERY, [
      statuses,
    ]),
    db.query<{
      plan_tier: string | null;
      previous_plan_tier: string | null;
      changes: string | number;
    }>(PLAN_CHANGE_QUERY, [from.toISOString(), to.toISOString()]),
    db.query<{ amount_cents: string | number }>(SUPPORT_COST_QUERY, [
      from.toISOString(),
      to.toISOString(),
      SUPPORT_ADJUSTMENT_KIND,
    ]),
  ]);

  const subscribersAtStart = (await readSnapshot(db, PAID_SUBSCRIBERS_METRIC, from)) ?? 0;

  let mrrMicrousd = 0;
  for (const row of planMixRows) {
    mrrMicrousd += monthlyPriceMicrousd(row.plan_tier) * toNumber(row.subscribers);
  }

  let expansionMicrousd = 0;
  for (const row of planChangeRows) {
    const delta =
      monthlyPriceMicrousd(row.plan_tier) - monthlyPriceMicrousd(row.previous_plan_tier);
    if (delta > 0) expansionMicrousd += delta * toNumber(row.changes);
  }

  const economics = await readEconomicsSummary({ from, to, groupBy: 'total', db });
  const revenueMicrousd = economics.totals.revenue?.cashMicrousd ?? 0;
  const cogsMicrousd = economics.totals.cogs.totalMicrousd;
  const supportCostMicrousd = toNumber(supportRows[0]?.amount_cents) * MICROUSD_PER_CENT;

  const qualityRows = await db.query<QualityRow>(QUALITY_QUERY, [
    from.toISOString(),
    to.toISOString(),
  ]);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    metrics: [
      absolute('dau', daily),
      absolute('wau', weekly),
      absolute('mau', monthly),
      d1,
      d7,
      d30,
      measure(
        'paid_conversion',
        toNumber(conversionRows[0]?.converted),
        toNumber(conversionRows[0]?.signups),
      ),
      measure('churn', toNumber(churnRows[0]?.churned), subscribersAtStart),
      measure('expansion', expansionMicrousd, mrrMicrousd),
      absolute('arr_microusd', mrrMicrousd * MONTHS_PER_YEAR),
      measure('arpu_microusd', revenueMicrousd, monthly),
      measure('gross_margin', revenueMicrousd - cogsMicrousd, revenueMicrousd),
      absolute('support_cost_microusd', supportCostMicrousd),
      ...qualityMetrics(qualityRows),
    ],
  };
}

export interface ProductMetricRollupResult {
  readonly day: string;
  readonly written: number;
  readonly purged: number;
}

export const PRODUCT_ANALYTICS_RETENTION_ENV = 'AGI_PRODUCT_ANALYTICS_RETENTION_DAYS';
export const DEFAULT_PRODUCT_ANALYTICS_RETENTION_DAYS = 180;

export function resolveProductAnalyticsRetentionDays(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = environment[PRODUCT_ANALYTICS_RETENTION_ENV];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_PRODUCT_ANALYTICS_RETENTION_DAYS;
}

/**
 * The daily snapshot exists because `subscriptions` holds one row per account
 * and overwrites it: without a snapshot, how many accounts were paying
 * yesterday is gone today, and churn has no denominator. It also lets the raw
 * event stream be purged on a short window without losing the series.
 */
export async function rollUpProductMetrics(
  now: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<ProductMetricRollupResult> {
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayStart = new Date(dayEnd.getTime() - MS_PER_DAY);
  const summary = await readProductMetrics({ from: dayStart, to: dayEnd, db });
  const day = dayStart.toISOString().slice(0, 10);

  const subscriberRows = await db.query<{ subscribers: string | number }>(PAID_SUBSCRIBERS_QUERY, [
    ACTIVE_SUBSCRIPTION_STATUSES,
  ]);

  const rows: Array<{
    metric: string;
    numerator: number;
    denominator: number;
    value: number | null;
  }> = [
    ...summary.metrics.map((metric) => ({
      metric: metric.metric as string,
      numerator: metric.numerator,
      denominator: metric.denominator,
      value: metric.value,
    })),
    {
      metric: PAID_SUBSCRIBERS_METRIC,
      numerator: toNumber(subscriberRows[0]?.subscribers),
      denominator: 0,
      value: toNumber(subscriberRows[0]?.subscribers),
    },
  ];

  for (const row of rows) {
    await db.execute(
      `insert into public.product_metric_days
         (metric_day, metric, scope, numerator, denominator, value, computed_at)
       values ($1::date, $2, 'all', $3, $4, $5, now())
       on conflict (metric_day, metric, scope) do update
          set numerator = excluded.numerator,
              denominator = excluded.denominator,
              value = excluded.value,
              computed_at = now()`,
      [day, row.metric, row.numerator, row.denominator, row.value],
    );
  }

  const cutoff = new Date(
    dayEnd.getTime() - resolveProductAnalyticsRetentionDays() * MS_PER_DAY,
  ).toISOString();
  const purged = await db.execute(
    `delete from public.product_analytics_events where occurred_at < $1`,
    [cutoff],
  );

  return { day, written: rows.length, purged };
}
