import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  BILLING_PLAN_PRICING,
  creditsFromMicrousd,
  isBillingPlanTier,
  MICROUSD_PER_CENT,
  MICROUSD_PER_USD,
  RATE_CARD_FEATURES,
} from '@agiworkforce/types';

import { ACTIVE_SUBSCRIPTION_STATUSES } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import type { CogsCapability } from '@/lib/services/cogs-ledger-service';

export const APPLE_COMMISSION_RATE = 0.3;
export const GOOGLE_PLAY_COMMISSION_RATE = 0.15;

const DAYS_PER_BILLING_MONTH = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const APPLE_STORE = 'apple';
const GOOGLE_STORE = 'google';
const SUBSCRIPTION_REVENUE_BASIS = 'derived_from_plan_price';

export const ECONOMICS_GROUPINGS = [
  'total',
  'plan',
  'model',
  'provider',
  'route',
  'feature',
  'surface',
] as const;

export type EconomicsGrouping = (typeof ECONOMICS_GROUPINGS)[number];

export function isEconomicsGrouping(value: string): value is EconomicsGrouping {
  return (ECONOMICS_GROUPINGS as readonly string[]).includes(value);
}

const REVENUE_ATTRIBUTABLE_GROUPINGS: ReadonlySet<EconomicsGrouping> = new Set<EconomicsGrouping>([
  'total',
  'plan',
]);

const TOTAL_KEY = 'total';
const UNKNOWN_KEY = 'unknown';
const NO_PLAN_KEY = 'none';

const GROUP_EXPRESSION: Record<EconomicsGrouping, string> = {
  total: `'${TOTAL_KEY}'`,
  plan: `coalesce(s.plan_tier, '${NO_PLAN_KEY}')`,
  model: `coalesce(e.model, '${UNKNOWN_KEY}')`,
  provider: 'e.provider',
  route: `coalesce(e.route_id, '${UNKNOWN_KEY}')`,
  feature: 'coalesce(e.feature, e.capability)',
  surface: `coalesce(e.surface, '${UNKNOWN_KEY}')`,
};

const SEARCH_FEATURES = RATE_CARD_FEATURES.filter((feature) => feature.startsWith('web_search'));
const SANDBOX_FEATURES = RATE_CARD_FEATURES.filter((feature) => feature.startsWith('sandbox_'));
const VOICE_FEATURES = RATE_CARD_FEATURES.filter(
  (feature) => feature.startsWith('voice_') || feature.startsWith('transcription_'),
);
const MEDIA_FEATURES = RATE_CARD_FEATURES.filter(
  (feature) => feature.startsWith('image_generation') || feature.startsWith('video_'),
);

const SANDBOX_CAPABILITIES: readonly CogsCapability[] = ['sandbox'];
const VOICE_CAPABILITIES: readonly CogsCapability[] = ['transcription'];
const MEDIA_CAPABILITIES: readonly CogsCapability[] = ['image', 'video'];

const PAYMENT_FEE_KINDS = ['stripe_fee'] as const;

export const COGS_CLASSES = ['model', 'search', 'sandbox', 'voice', 'media'] as const;
export type CogsClass = (typeof COGS_CLASSES)[number];

export const RECONCILIATION_STATUSES = ['estimated', 'provider_reported', 'reconciled'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface EconomicsCogs {
  totalMicrousd: number;
  estimatedMicrousd: number;
  reportedMicrousd: number;
  byClassMicrousd: Record<CogsClass, number>;
  rowsByStatus: Record<ReconciliationStatus, number>;
}

export interface EconomicsStoreCommission {
  appleMicrousd: number;
  googleMicrousd: number;
  totalMicrousd: number;
  estimate: true;
}

export interface EconomicsRevenue {
  subscriptionMicrousd: number;
  topUpMicrousd: number;
  cashMicrousd: number;
  subscriptions: number;
  unpricedSubscriptions: number;
}

export interface EconomicsSummaryGroup {
  key: string;
  events: number;
  legacyRows: number;
  canonicalValueMicrousd: number;
  canonicalValueCredits: number;
  cogs: EconomicsCogs;
  paymentFeesMicrousd: number;
  storeCommission: EconomicsStoreCommission;
  revenue: EconomicsRevenue | null;
  contributionMicrousd: number | null;
  contributionMargin: number | null;
  canonicalValueToCogsRatio: number | null;
}

export interface EconomicsReconciliationGap {
  provider: string;
  day: string;
  source: string;
  reportedMicrousd: number;
  ledgerMicrousd: number;
  gapMicrousd: number;
}

export interface EconomicsReconciliation {
  available: boolean;
  gaps: EconomicsReconciliationGap[];
}

export interface EconomicsSummary {
  from: string;
  to: string;
  groupBy: EconomicsGrouping;
  subscriptionRevenueBasis: typeof SUBSCRIPTION_REVENUE_BASIS;
  groups: EconomicsSummaryGroup[];
  totals: EconomicsSummaryGroup;
  reconciliation: EconomicsReconciliation;
}

export interface EconomicsSummaryInput {
  from: Date;
  to: Date;
  groupBy: EconomicsGrouping;
  db?: DatabaseAdapter;
}

interface CostRow {
  group_key: string | null;
  events: string | number | null;
  legacy_rows: string | number | null;
  canonical_microusd: string | number | null;
  estimated_microusd: string | number | null;
  reported_microusd: string | number | null;
  model_microusd: string | number | null;
  search_microusd: string | number | null;
  sandbox_microusd: string | number | null;
  voice_microusd: string | number | null;
  media_microusd: string | number | null;
  rows_estimated: string | number | null;
  rows_provider_reported: string | number | null;
  rows_reconciled: string | number | null;
}

interface SubscriptionRow {
  plan_tier: string | null;
  subscriptions: string | number | null;
  apple_subscriptions: string | number | null;
  google_subscriptions: string | number | null;
}

interface TopUpRow {
  plan_tier: string | null;
  amount_cents: string | number | null;
  apple_cents: string | number | null;
  google_cents: string | number | null;
}

interface FeeRow {
  amount_cents: string | number | null;
}

interface ReconciliationRow {
  provider: string;
  day: string;
  source: string;
  reported_microusd: string | number | null;
  ledger_microusd: string | number | null;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function emptyCogs(): EconomicsCogs {
  return {
    totalMicrousd: 0,
    estimatedMicrousd: 0,
    reportedMicrousd: 0,
    byClassMicrousd: { model: 0, search: 0, sandbox: 0, voice: 0, media: 0 },
    rowsByStatus: { estimated: 0, provider_reported: 0, reconciled: 0 },
  };
}

function emptyRevenue(): EconomicsRevenue {
  return {
    subscriptionMicrousd: 0,
    topUpMicrousd: 0,
    cashMicrousd: 0,
    subscriptions: 0,
    unpricedSubscriptions: 0,
  };
}

function emptyCommission(): EconomicsStoreCommission {
  return { appleMicrousd: 0, googleMicrousd: 0, totalMicrousd: 0, estimate: true };
}

function periodMonths(from: Date, to: Date): number {
  const days = Math.max(0, (to.getTime() - from.getTime()) / MS_PER_DAY);
  return days / DAYS_PER_BILLING_MONTH;
}

function monthlyPriceMicrousd(planTier: string): number | null {
  if (!isBillingPlanTier(planTier)) return null;
  const pricing = BILLING_PLAN_PRICING[planTier];
  if (!('monthlyPriceUsd' in pricing)) return null;
  return pricing.monthlyPriceUsd * MICROUSD_PER_USD;
}

function costQuery(groupBy: EconomicsGrouping): string {
  return `with priced as (
      select
        ${GROUP_EXPRESSION[groupBy]} as group_key,
        e.reconciliation_status as reconciliation_status,
        case
          when e.feature = any($4::text[]) then 'search'
          when e.capability = any($5::text[]) or e.feature = any($6::text[]) then 'sandbox'
          when e.capability = any($7::text[]) or e.feature = any($8::text[]) then 'voice'
          when e.capability = any($9::text[]) or e.feature = any($10::text[]) then 'media'
          else 'model'
        end as cogs_class,
        coalesce(
          e.customer_canonical_microusd,
          case
            when e.metadata ->> 'retailCostCents' ~ '^[0-9]+$'
              then (e.metadata ->> 'retailCostCents')::bigint * $3::bigint
          end,
          e.billed_cents::bigint * $3::bigint
        ) as canonical_microusd,
        e.customer_canonical_microusd is null as legacy_row,
        e.provider_reported_cost_microusd as reported_microusd,
        coalesce(
          e.provider_estimated_cost_microusd,
          e.provider_cost_cents::bigint * $3::bigint
        ) as estimated_microusd
      from public.provider_cost_events e
      left join public.subscriptions s on s.user_id = e.user_id
      where e.occurred_at >= $1 and e.occurred_at < $2
    )
    select
      group_key,
      count(*) as events,
      count(*) filter (where legacy_row) as legacy_rows,
      coalesce(sum(canonical_microusd), 0) as canonical_microusd,
      coalesce(sum(estimated_microusd) filter (where reported_microusd is null), 0)
        as estimated_microusd,
      coalesce(sum(reported_microusd), 0) as reported_microusd,
      coalesce(sum(coalesce(reported_microusd, estimated_microusd))
        filter (where cogs_class = 'model'), 0) as model_microusd,
      coalesce(sum(coalesce(reported_microusd, estimated_microusd))
        filter (where cogs_class = 'search'), 0) as search_microusd,
      coalesce(sum(coalesce(reported_microusd, estimated_microusd))
        filter (where cogs_class = 'sandbox'), 0) as sandbox_microusd,
      coalesce(sum(coalesce(reported_microusd, estimated_microusd))
        filter (where cogs_class = 'voice'), 0) as voice_microusd,
      coalesce(sum(coalesce(reported_microusd, estimated_microusd))
        filter (where cogs_class = 'media'), 0) as media_microusd,
      count(*) filter (where reconciliation_status = 'estimated') as rows_estimated,
      count(*) filter (where reconciliation_status = 'provider_reported')
        as rows_provider_reported,
      count(*) filter (where reconciliation_status = 'reconciled') as rows_reconciled
    from priced
    group by group_key
    order by group_key`;
}

const SUBSCRIPTION_QUERY = `select
    coalesce(plan_tier, $4) as plan_tier,
    count(*) as subscriptions,
    count(*) filter (where apple_original_transaction_id is not null) as apple_subscriptions,
    count(*) filter (where google_purchase_token is not null) as google_subscriptions
  from public.subscriptions
  where status = any($3::text[])
    and created_at < $2
    and (current_period_end is null or current_period_end >= $1)
  group by 1`;

const TOP_UP_QUERY = `select
    coalesce(s.plan_tier, $5) as plan_tier,
    coalesce(sum(t.amount_cents), 0) as amount_cents,
    coalesce(sum(t.amount_cents) filter (
      where t.metadata ->> 'store' = $3
         or (t.metadata ->> 'store' is null and s.apple_original_transaction_id is not null)
    ), 0) as apple_cents,
    coalesce(sum(t.amount_cents) filter (
      where t.metadata ->> 'store' = $4
         or (t.metadata ->> 'store' is null and s.google_purchase_token is not null)
    ), 0) as google_cents
  from public.credit_transactions t
  left join public.subscriptions s on s.user_id = t.user_id
  where t.transaction_type = 'purchase'
    and t.created_at >= $1
    and t.created_at < $2
  group by 1`;

const PAYMENT_FEE_QUERY = `select coalesce(sum(amount_cents), 0) as amount_cents
  from public.cogs_adjustments
  where occurred_at >= $1 and occurred_at < $2 and kind = any($3::text[])`;

const RECONCILIATION_QUERY = `with ledger as (
    select
      provider,
      (date_trunc('day', occurred_at))::date as day,
      sum(coalesce(
        provider_reported_cost_microusd,
        provider_estimated_cost_microusd,
        provider_cost_cents::bigint * $3::bigint
      )) as ledger_microusd
    from public.provider_cost_events
    where occurred_at >= $1 and occurred_at < $2
    group by 1, 2
  )
  select
    r.provider,
    r.day::text as day,
    r.source,
    r.reported_cost_microusd as reported_microusd,
    coalesce(l.ledger_microusd, 0) as ledger_microusd
  from public.provider_cost_reconciliation_days r
  left join ledger l on l.provider = r.provider and l.day = r.day
  where r.day >= $1::date and r.day < $2::date
  order by r.day desc, r.provider, r.source`;

function costGroup(row: CostRow): EconomicsSummaryGroup {
  const estimated = toNumber(row.estimated_microusd);
  const reported = toNumber(row.reported_microusd);
  const byClassMicrousd: Record<CogsClass, number> = {
    model: toNumber(row.model_microusd),
    search: toNumber(row.search_microusd),
    sandbox: toNumber(row.sandbox_microusd),
    voice: toNumber(row.voice_microusd),
    media: toNumber(row.media_microusd),
  };
  const canonicalValueMicrousd = toNumber(row.canonical_microusd);
  const totalMicrousd = estimated + reported;

  return {
    key: row.group_key ?? UNKNOWN_KEY,
    events: toNumber(row.events),
    legacyRows: toNumber(row.legacy_rows),
    canonicalValueMicrousd,
    canonicalValueCredits: creditsFromMicrousd(canonicalValueMicrousd),
    cogs: {
      totalMicrousd,
      estimatedMicrousd: estimated,
      reportedMicrousd: reported,
      byClassMicrousd,
      rowsByStatus: {
        estimated: toNumber(row.rows_estimated),
        provider_reported: toNumber(row.rows_provider_reported),
        reconciled: toNumber(row.rows_reconciled),
      },
    },
    paymentFeesMicrousd: 0,
    storeCommission: emptyCommission(),
    revenue: null,
    contributionMicrousd: null,
    contributionMargin: null,
    canonicalValueToCogsRatio: ratio(canonicalValueMicrousd, totalMicrousd),
  };
}

function emptyGroup(key: string): EconomicsSummaryGroup {
  return {
    key,
    events: 0,
    legacyRows: 0,
    canonicalValueMicrousd: 0,
    canonicalValueCredits: 0,
    cogs: emptyCogs(),
    paymentFeesMicrousd: 0,
    storeCommission: emptyCommission(),
    revenue: null,
    contributionMicrousd: null,
    contributionMargin: null,
    canonicalValueToCogsRatio: null,
  };
}

function accumulate(target: EconomicsSummaryGroup, source: EconomicsSummaryGroup): void {
  target.events += source.events;
  target.legacyRows += source.legacyRows;
  target.canonicalValueMicrousd += source.canonicalValueMicrousd;
  target.canonicalValueCredits += source.canonicalValueCredits;
  target.cogs.totalMicrousd += source.cogs.totalMicrousd;
  target.cogs.estimatedMicrousd += source.cogs.estimatedMicrousd;
  target.cogs.reportedMicrousd += source.cogs.reportedMicrousd;
  for (const cogsClass of COGS_CLASSES) {
    target.cogs.byClassMicrousd[cogsClass] += source.cogs.byClassMicrousd[cogsClass];
  }
  for (const status of RECONCILIATION_STATUSES) {
    target.cogs.rowsByStatus[status] += source.cogs.rowsByStatus[status];
  }
}

function settle(group: EconomicsSummaryGroup): EconomicsSummaryGroup {
  group.canonicalValueToCogsRatio = ratio(group.canonicalValueMicrousd, group.cogs.totalMicrousd);
  if (!group.revenue) return group;

  const contribution =
    group.revenue.cashMicrousd -
    group.cogs.totalMicrousd -
    group.paymentFeesMicrousd -
    group.storeCommission.totalMicrousd;
  group.contributionMicrousd = contribution;
  group.contributionMargin = ratio(contribution, group.revenue.cashMicrousd);
  return group;
}

function applyCommission(group: EconomicsSummaryGroup, apple: number, google: number): void {
  group.storeCommission.appleMicrousd += apple;
  group.storeCommission.googleMicrousd += google;
  group.storeCommission.totalMicrousd = Math.round(
    group.storeCommission.appleMicrousd + group.storeCommission.googleMicrousd,
  );
}

export async function readEconomicsSummary(
  input: EconomicsSummaryInput,
): Promise<EconomicsSummary> {
  const db = input.db ?? getNeonDb();
  const from = input.from.toISOString();
  const to = input.to.toISOString();
  const months = periodMonths(input.from, input.to);

  const costRows = await db.query<CostRow>(costQuery(input.groupBy), [
    from,
    to,
    MICROUSD_PER_CENT,
    SEARCH_FEATURES,
    SANDBOX_CAPABILITIES,
    SANDBOX_FEATURES,
    VOICE_CAPABILITIES,
    VOICE_FEATURES,
    MEDIA_CAPABILITIES,
    MEDIA_FEATURES,
  ]);

  const [subscriptionRows, topUpRows, feeRows] = await Promise.all([
    db.query<SubscriptionRow>(SUBSCRIPTION_QUERY, [
      from,
      to,
      ACTIVE_SUBSCRIPTION_STATUSES,
      NO_PLAN_KEY,
    ]),
    db.query<TopUpRow>(TOP_UP_QUERY, [from, to, APPLE_STORE, GOOGLE_STORE, NO_PLAN_KEY]),
    db.query<FeeRow>(PAYMENT_FEE_QUERY, [from, to, PAYMENT_FEE_KINDS]),
  ]);

  const groups = new Map<string, EconomicsSummaryGroup>();
  for (const row of costRows) {
    const group = costGroup(row);
    groups.set(group.key, group);
  }

  const revenueByPlan = new Map<string, EconomicsRevenue>();
  const commissionByPlan = new Map<string, { apple: number; google: number }>();

  for (const row of subscriptionRows) {
    const planTier = row.plan_tier ?? NO_PLAN_KEY;
    const subscriptions = toNumber(row.subscriptions);
    const price = monthlyPriceMicrousd(planTier);
    const revenue = revenueByPlan.get(planTier) ?? emptyRevenue();
    revenue.subscriptions += subscriptions;
    if (price === null) {
      revenue.unpricedSubscriptions += subscriptions;
    } else {
      const perSubscription = price * months;
      revenue.subscriptionMicrousd += Math.round(perSubscription * subscriptions);
      const commission = commissionByPlan.get(planTier) ?? { apple: 0, google: 0 };
      commission.apple += Math.round(
        perSubscription * toNumber(row.apple_subscriptions) * APPLE_COMMISSION_RATE,
      );
      commission.google += Math.round(
        perSubscription * toNumber(row.google_subscriptions) * GOOGLE_PLAY_COMMISSION_RATE,
      );
      commissionByPlan.set(planTier, commission);
    }
    revenueByPlan.set(planTier, revenue);
  }

  for (const row of topUpRows) {
    const planTier = row.plan_tier ?? NO_PLAN_KEY;
    const revenue = revenueByPlan.get(planTier) ?? emptyRevenue();
    revenue.topUpMicrousd += toNumber(row.amount_cents) * MICROUSD_PER_CENT;
    revenueByPlan.set(planTier, revenue);

    const commission = commissionByPlan.get(planTier) ?? { apple: 0, google: 0 };
    commission.apple += Math.round(
      toNumber(row.apple_cents) * MICROUSD_PER_CENT * APPLE_COMMISSION_RATE,
    );
    commission.google += Math.round(
      toNumber(row.google_cents) * MICROUSD_PER_CENT * GOOGLE_PLAY_COMMISSION_RATE,
    );
    commissionByPlan.set(planTier, commission);
  }

  for (const revenue of revenueByPlan.values()) {
    revenue.cashMicrousd = revenue.subscriptionMicrousd + revenue.topUpMicrousd;
  }

  const paymentFeesMicrousd = feeRows.reduce(
    (total, row) => total + toNumber(row.amount_cents) * MICROUSD_PER_CENT,
    0,
  );

  const totals = emptyGroup(TOTAL_KEY);
  for (const group of groups.values()) accumulate(totals, group);

  const totalRevenue = emptyRevenue();
  for (const revenue of revenueByPlan.values()) {
    totalRevenue.subscriptionMicrousd += revenue.subscriptionMicrousd;
    totalRevenue.topUpMicrousd += revenue.topUpMicrousd;
    totalRevenue.cashMicrousd += revenue.cashMicrousd;
    totalRevenue.subscriptions += revenue.subscriptions;
    totalRevenue.unpricedSubscriptions += revenue.unpricedSubscriptions;
  }
  totals.revenue = totalRevenue;
  totals.paymentFeesMicrousd = paymentFeesMicrousd;
  for (const commission of commissionByPlan.values()) {
    applyCommission(totals, commission.apple, commission.google);
  }

  if (REVENUE_ATTRIBUTABLE_GROUPINGS.has(input.groupBy)) {
    const cashTotal = totalRevenue.cashMicrousd;
    for (const [planTier, revenue] of revenueByPlan) {
      const key = input.groupBy === 'plan' ? planTier : TOTAL_KEY;
      const group = groups.get(key) ?? emptyGroup(key);
      group.revenue = group.revenue
        ? {
            subscriptionMicrousd: group.revenue.subscriptionMicrousd + revenue.subscriptionMicrousd,
            topUpMicrousd: group.revenue.topUpMicrousd + revenue.topUpMicrousd,
            cashMicrousd: group.revenue.cashMicrousd + revenue.cashMicrousd,
            subscriptions: group.revenue.subscriptions + revenue.subscriptions,
            unpricedSubscriptions:
              group.revenue.unpricedSubscriptions + revenue.unpricedSubscriptions,
          }
        : { ...revenue };
      const commission = commissionByPlan.get(planTier);
      if (commission) applyCommission(group, commission.apple, commission.google);
      group.paymentFeesMicrousd = cashTotal
        ? Math.round((paymentFeesMicrousd * revenue.cashMicrousd) / cashTotal)
        : 0;
      groups.set(key, group);
    }
    if (input.groupBy === TOTAL_KEY) {
      const group = groups.get(TOTAL_KEY);
      if (group) group.paymentFeesMicrousd = paymentFeesMicrousd;
    }
  }

  const reconciliation = await readReconciliationGaps(db, from, to);

  return {
    from,
    to,
    groupBy: input.groupBy,
    subscriptionRevenueBasis: SUBSCRIPTION_REVENUE_BASIS,
    groups: [...groups.values()].map(settle),
    totals: settle(totals),
    reconciliation,
  };
}

async function readReconciliationGaps(
  db: DatabaseAdapter,
  from: string,
  to: string,
): Promise<EconomicsReconciliation> {
  try {
    const rows = await db.query<ReconciliationRow>(RECONCILIATION_QUERY, [
      from,
      to,
      MICROUSD_PER_CENT,
    ]);
    return {
      available: true,
      gaps: rows.map((row) => {
        const reportedMicrousd = toNumber(row.reported_microusd);
        const ledgerMicrousd = toNumber(row.ledger_microusd);
        return {
          provider: row.provider,
          day: row.day,
          source: row.source,
          reportedMicrousd,
          ledgerMicrousd,
          gapMicrousd: reportedMicrousd - ledgerMicrousd,
        };
      }),
    };
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Provider cost reconciliation days are unavailable; migration 0181 may not be applied',
    );
    return { available: false, gaps: [] };
  }
}
