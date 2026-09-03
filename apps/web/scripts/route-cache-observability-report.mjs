#!/usr/bin/env node

import process from 'node:process';
import { Client } from 'pg';

const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const JOIN_SLACK_MS = 24 * 60 * 60 * 1000;
const BREAKDOWN_LIMIT = 50;

const ROUTE_ID_EXPRESSION = `coalesce(pce.metadata->>'servedRouteId', pce.provider || '/' || coalesce(pce.model, ''))`;
const INPUT_TOKENS_EXPRESSION = `coalesce((pce.metadata->>'inputTokens')::numeric, (pce.metadata->>'promptTokens')::numeric, 0)`;
const RETAIL_COST_EXPRESSION = `(pce.metadata->>'retailCostCents')::numeric`;
const FALLBACK_EXPRESSION = `(pce.metadata->>'reservedRouteId') is not null and (pce.metadata->>'reservedRouteId') <> (pce.provider || '/' || coalesce(pce.model, ''))`;
const LATENCY_EXPRESSION = `case
    when mur.provider_started_at is not null and mur.provider_succeeded_at is not null
      then extract(epoch from (mur.provider_succeeded_at - mur.provider_started_at)) * 1000
    else null
  end`;

const REPORT_QUERY = `
  select
    ${ROUTE_ID_EXPRESSION} as route,
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
  left join public.managed_usage_requests mur
    on mur.request_hash = pce.task_ref
   and pce.source_ref = 'managed_usage:' || mur.user_id || ':' || mur.idempotency_key || ':' || mur.request_hash
   and mur.created_at >= $3::timestamptz
   and mur.created_at < $4::timestamptz
  where pce.occurred_at >= $1::timestamptz
    and pce.occurred_at < $2::timestamptz
  group by 1
  order by actual_cost_cents desc, requests desc
  limit ${BREAKDOWN_LIMIT}`;

function databaseUrl() {
  return process.env.AGI_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(Number(value ?? 0) * factor) / factor;
}

function toReportRow(row) {
  const requests = Number(row.requests ?? 0);
  const cacheHitRequests = Number(row.cache_hit_requests ?? 0);
  const actualCostCents = Number(row.actual_cost_cents ?? 0);
  const retailCostCents = Number(row.retail_cost_cents ?? 0);
  const retailPricedRequests = Number(row.retail_priced_requests ?? 0);

  return {
    route: row.route,
    requests,
    cache_read_tokens: Number(row.cache_read_tokens ?? 0),
    cache_write_tokens: Number(row.cache_write_tokens ?? 0),
    input_tokens: Number(row.input_tokens ?? 0),
    cache_hit_rate: requests > 0 ? round(cacheHitRequests / requests, 3) : 0,
    actual_cost_usd: round(actualCostCents / 100, 2),
    retail_cost_usd: round(retailCostCents / 100, 2),
    value_multiplier:
      retailPricedRequests > 0 && actualCostCents > 0
        ? round(retailCostCents / actualCostCents, 2)
        : null,
    fallback_count: Number(row.fallback_count ?? 0),
    latency_p50_ms: row.latency_p50_ms === null ? null : round(row.latency_p50_ms, 0),
    latency_p95_ms: row.latency_p95_ms === null ? null : round(row.latency_p95_ms, 0),
  };
}

async function main() {
  const connectionString = databaseUrl();
  if (!connectionString) {
    console.error(
      'No database URL found. Set AGI_DATABASE_URL, DATABASE_URL or NEON_DATABASE_URL.',
    );
    process.exitCode = 1;
    return;
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - REPORT_WINDOW_MS);
  const joinSlackStart = new Date(periodStart.getTime() - JOIN_SLACK_MS);
  const joinSlackEnd = new Date(periodEnd.getTime() + JOIN_SLACK_MS);

  const client = new Client({
    connectionString,
    application_name: 'agiworkforce-route-cache-report',
  });
  await client.connect();
  try {
    const result = await client.query(REPORT_QUERY, [
      periodStart.toISOString(),
      periodEnd.toISOString(),
      joinSlackStart.toISOString(),
      joinSlackEnd.toISOString(),
    ]);

    console.log(
      `Route and cache observability, ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );
    if (result.rows.length === 0) {
      console.log('No provider cost events in this window.');
      return;
    }
    console.table(result.rows.map(toReportRow));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
