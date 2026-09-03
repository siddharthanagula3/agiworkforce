import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';

export type ObservabilityDimension = 'route' | 'model' | 'user' | 'tenant';

export const OBSERVABILITY_BREAKDOWN_LIMIT = 50;
export const OBSERVABILITY_JOIN_SLACK_MS = 24 * 60 * 60 * 1000;
export const OBSERVABILITY_DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ObservabilityMetricsRow {
  key: string;
  requests: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputTokens: number;
  cacheHitRate: number;
  actualCostCents: number;
  retailCostCents: number;
  valueMultiplier: number | null;
  fallbackCount: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
}

export interface RequestExplain {
  userId: string;
  idempotencyKey: string;
  requestedProvider: string | null;
  requestedModel: string | null;
  deliveredProvider: string | null;
  deliveredModel: string | null;
  routeId: string | null;
  fallbackOccurred: boolean;
  fallbackReason: string | null;
  fallbackSequence: unknown[];
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputTokens: number;
  actualCostCents: number;
  retailCostCents: number | null;
  valueMultiplier: number | null;
  latencyMs: number | null;
  status: string;
  createdAt: string;
}

type SqlScalar = string | number | null | undefined;

function toNumber(value: SqlScalar): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: SqlScalar): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

const ROUTE_ID_EXPRESSION = `coalesce(pce.metadata->>'servedRouteId', pce.provider || '/' || coalesce(pce.model, ''))`;
const INPUT_TOKENS_EXPRESSION = `coalesce((pce.metadata->>'inputTokens')::numeric, (pce.metadata->>'promptTokens')::numeric, 0)`;
const RETAIL_COST_EXPRESSION = `(pce.metadata->>'retailCostCents')::numeric`;
const FALLBACK_EXPRESSION = `(pce.metadata->>'reservedRouteId') is not null and (pce.metadata->>'reservedRouteId') <> (pce.provider || '/' || coalesce(pce.model, ''))`;
const LATENCY_EXPRESSION = `case
    when mur.provider_started_at is not null and mur.provider_succeeded_at is not null
      then extract(epoch from (mur.provider_succeeded_at - mur.provider_started_at)) * 1000
    else null
  end`;

const REQUEST_JOIN = `
  left join public.managed_usage_requests mur
    on mur.request_hash = pce.task_ref
   and pce.source_ref = 'managed_usage:' || mur.user_id || ':' || mur.idempotency_key || ':' || mur.request_hash
   and mur.created_at >= $3::timestamptz
   and mur.created_at < $4::timestamptz`;

const DIMENSION_KEY_EXPRESSION: Record<ObservabilityDimension, string> = {
  route: ROUTE_ID_EXPRESSION,
  model: `coalesce(pce.model, 'unknown')`,
  user: `coalesce(pce.user_id, 'unknown')`,
  tenant: `case
      when mur.id is null then 'unmatched'
      when mur.organization_id is null then 'personal'
      else mur.organization_id::text
    end`,
};

interface ObservabilityRow {
  key: string | null;
  requests: SqlScalar;
  cache_read_tokens: SqlScalar;
  cache_write_tokens: SqlScalar;
  input_tokens: SqlScalar;
  cache_hit_requests: SqlScalar;
  actual_cost_cents: SqlScalar;
  retail_cost_cents: SqlScalar;
  retail_priced_requests: SqlScalar;
  fallback_count: SqlScalar;
  latency_p50_ms: SqlScalar;
  latency_p95_ms: SqlScalar;
}

function toMetricsRow(row: ObservabilityRow): ObservabilityMetricsRow {
  const requests = toNumber(row.requests);
  const cacheHitRequests = toNumber(row.cache_hit_requests);
  const actualCostCents = toNumber(row.actual_cost_cents);
  const retailCostCents = toNumber(row.retail_cost_cents);
  const retailPricedRequests = toNumber(row.retail_priced_requests);

  return {
    key: row.key ?? 'unknown',
    requests,
    cacheReadTokens: toNumber(row.cache_read_tokens),
    cacheWriteTokens: toNumber(row.cache_write_tokens),
    inputTokens: toNumber(row.input_tokens),
    cacheHitRate: requests > 0 ? cacheHitRequests / requests : 0,
    actualCostCents,
    retailCostCents,
    valueMultiplier:
      retailPricedRequests > 0 && actualCostCents > 0 ? retailCostCents / actualCostCents : null,
    fallbackCount: toNumber(row.fallback_count),
    latencyP50Ms: toNullableNumber(row.latency_p50_ms),
    latencyP95Ms: toNullableNumber(row.latency_p95_ms),
  };
}

export async function getObservabilityBreakdown(
  dimension: ObservabilityDimension,
  periodStart: Date,
  periodEnd: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<ObservabilityMetricsRow[]> {
  const joinSlackStart = new Date(periodStart.getTime() - OBSERVABILITY_JOIN_SLACK_MS);
  const joinSlackEnd = new Date(periodEnd.getTime() + OBSERVABILITY_JOIN_SLACK_MS);

  const rows = await db.query<ObservabilityRow>(
    `select
       ${DIMENSION_KEY_EXPRESSION[dimension]} as key,
       count(*)::bigint as requests,
       sum(pce.cache_read_units)::numeric as cache_read_tokens,
       sum(pce.cache_write_units)::numeric as cache_write_tokens,
       sum(${INPUT_TOKENS_EXPRESSION})::numeric as input_tokens,
       count(*) filter (where pce.cache_read_units > 0)::bigint as cache_hit_requests,
       sum(pce.provider_cost_cents)::bigint as actual_cost_cents,
       sum(coalesce(${RETAIL_COST_EXPRESSION}, 0))::bigint as retail_cost_cents,
       count(*) filter (where ${RETAIL_COST_EXPRESSION} is not null)::bigint as retail_priced_requests,
       count(*) filter (where ${FALLBACK_EXPRESSION})::bigint as fallback_count,
       percentile_cont(0.5) within group (order by ${LATENCY_EXPRESSION}) as latency_p50_ms,
       percentile_cont(0.95) within group (order by ${LATENCY_EXPRESSION}) as latency_p95_ms
     from public.provider_cost_events pce
     ${REQUEST_JOIN}
     where pce.occurred_at >= $1::timestamptz
       and pce.occurred_at < $2::timestamptz
     group by 1
     order by actual_cost_cents desc, requests desc
     limit ${OBSERVABILITY_BREAKDOWN_LIMIT}`,
    [
      periodStart.toISOString(),
      periodEnd.toISOString(),
      joinSlackStart.toISOString(),
      joinSlackEnd.toISOString(),
    ],
  );

  return rows.map(toMetricsRow);
}

interface RequestExplainRow {
  user_id: string;
  idempotency_key: string;
  requested_provider: string | null;
  requested_model: string | null;
  delivered_provider: string | null;
  delivered_model: string | null;
  route_id: string | null;
  reserved_route_id: string | null;
  fallback_reason: string | null;
  fallback_sequence: unknown;
  cache_read_tokens: SqlScalar;
  cache_write_tokens: SqlScalar;
  input_tokens: SqlScalar;
  actual_cost_cents: SqlScalar;
  retail_cost_cents: SqlScalar;
  latency_ms: SqlScalar;
  status: string;
  created_at: string | Date;
}

export async function explainManagedUsageRequest(
  input: { userId: string; idempotencyKey: string },
  db: DatabaseAdapter = getNeonDb(),
): Promise<RequestExplain | null> {
  const rows = await db.query<RequestExplainRow>(
    `select
       mur.user_id,
       mur.idempotency_key,
       mur.provider as requested_provider,
       mur.model as requested_model,
       coalesce(pce.provider, mur.provider) as delivered_provider,
       coalesce(pce.model, mur.model) as delivered_model,
       coalesce(
         pce.metadata->>'servedRouteId',
         coalesce(pce.provider, mur.provider) || '/' || coalesce(pce.model, mur.model, '')
       ) as route_id,
       pce.metadata->>'reservedRouteId' as reserved_route_id,
       coalesce(pce.metadata->>'fallbackReason', pce.metadata->>'reason') as fallback_reason,
       coalesce(mur.usage->'providerCallObservations', '[]'::jsonb) as fallback_sequence,
       coalesce(pce.cache_read_units, 0) as cache_read_tokens,
       coalesce(pce.cache_write_units, 0) as cache_write_tokens,
       ${INPUT_TOKENS_EXPRESSION} as input_tokens,
       coalesce(pce.provider_cost_cents, mur.actual_cost_cents, 0) as actual_cost_cents,
       (pce.metadata->>'retailCostCents')::numeric as retail_cost_cents,
       ${LATENCY_EXPRESSION} as latency_ms,
       mur.status,
       mur.created_at
     from public.managed_usage_requests mur
     left join public.provider_cost_events pce
       on pce.source_ref = 'managed_usage:' || mur.user_id || ':' || mur.idempotency_key || ':' || mur.request_hash
     where mur.user_id = $1
       and mur.idempotency_key = $2
     limit 1`,
    [input.userId, input.idempotencyKey],
  );

  const row = rows[0];
  if (!row) return null;

  const actualCostCents = toNumber(row.actual_cost_cents);
  const retailCostCents = toNullableNumber(row.retail_cost_cents);
  const routeId = row.route_id;
  const reservedRouteId = row.reserved_route_id;

  return {
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    requestedProvider: row.requested_provider,
    requestedModel: row.requested_model,
    deliveredProvider: row.delivered_provider,
    deliveredModel: row.delivered_model,
    routeId,
    fallbackOccurred: reservedRouteId !== null && reservedRouteId !== routeId,
    fallbackReason: row.fallback_reason,
    fallbackSequence: Array.isArray(row.fallback_sequence) ? row.fallback_sequence : [],
    cacheReadTokens: toNumber(row.cache_read_tokens),
    cacheWriteTokens: toNumber(row.cache_write_tokens),
    inputTokens: toNumber(row.input_tokens),
    actualCostCents,
    retailCostCents,
    valueMultiplier:
      retailCostCents !== null && actualCostCents > 0 ? retailCostCents / actualCostCents : null,
    latencyMs: toNullableNumber(row.latency_ms),
    status: row.status,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export function resolveObservabilityWindow(
  fromParam: string | null,
  toParam: string | null,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const to = toParam ? new Date(toParam) : now;
  const safeTo = Number.isNaN(to.getTime()) ? now : to;

  const requestedFrom = fromParam ? new Date(fromParam) : null;
  const defaultFrom = new Date(safeTo.getTime() - OBSERVABILITY_DEFAULT_WINDOW_MS);
  const from =
    requestedFrom && !Number.isNaN(requestedFrom.getTime()) ? requestedFrom : defaultFrom;

  return { from: from > safeTo ? safeTo : from, to: safeTo };
}
