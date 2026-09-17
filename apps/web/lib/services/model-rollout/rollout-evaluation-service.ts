import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { getNeonDb } from '@/lib/server/neon-db';

export type RolloutCohort = 'control' | 'canary' | 'shadow';
export type RolloutAlertKind = 'quality' | 'latency' | 'cost';

export interface RolloutEvaluationConfig {
  windowMs: number;
  minimumSamples: number;
  failureRateIncrease: number;
  latencyRatio: number;
  costRatio: number;
  traceRetentionDays: number;
  retentionBatchSize: number;
}

export const ROLLOUT_EVALUATION_ENV = {
  windowMs: 'AGI_ROLLOUT_WINDOW_MS',
  minimumSamples: 'AGI_ROLLOUT_MIN_SAMPLES',
  failureRateIncrease: 'AGI_ROLLOUT_FAILURE_RATE_INCREASE',
  latencyRatio: 'AGI_ROLLOUT_LATENCY_RATIO',
  costRatio: 'AGI_ROLLOUT_COST_RATIO',
  traceRetentionDays: 'AGI_ROUTING_TRACE_RETENTION_DAYS',
  retentionBatchSize: 'AGI_ROUTING_TRACE_RETENTION_BATCH',
} as const satisfies Record<keyof RolloutEvaluationConfig, string>;

export const DEFAULT_ROLLOUT_EVALUATION_CONFIG: RolloutEvaluationConfig = {
  windowMs: 60 * 60 * 1000,
  minimumSamples: 20,
  failureRateIncrease: 0.05,
  latencyRatio: 1.5,
  costRatio: 1.5,
  traceRetentionDays: 30,
  retentionBatchSize: 5_000,
};

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveRolloutEvaluationConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RolloutEvaluationConfig {
  const config = { ...DEFAULT_ROLLOUT_EVALUATION_CONFIG };
  for (const key of Object.keys(ROLLOUT_EVALUATION_ENV) as (keyof RolloutEvaluationConfig)[]) {
    config[key] = positiveNumber(environment[ROLLOUT_EVALUATION_ENV[key]], config[key]);
  }
  return config;
}

export interface CohortMetrics {
  slotId: string;
  cohort: RolloutCohort;
  modelKey: string;
  lifecycleStage: string | null;
  samples: number;
  failureRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  costPerRequestMicrousd: number | null;
}

interface CohortMetricsRow {
  slot_id: string;
  cohort: RolloutCohort;
  model_key: string;
  lifecycle_stage: string | null;
  samples: string | number;
  failures: string | number;
  latency_p50_ms: string | number | null;
  latency_p95_ms: string | number | null;
  cost_per_request_microusd: string | number | null;
}

function numberOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function readCohortMetrics(
  windowStart: Date,
  windowEnd: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<CohortMetrics[]> {
  const rows = await db.query<CohortMetricsRow>(
    `select trace.slot_id,
            case when trace.kind = 'shadow' then 'shadow' else trace.cohort end as cohort,
            trace.model_key,
            trace.lifecycle_stage,
            count(*) as samples,
            count(*) filter (where trace.outcome = 'failed') as failures,
            percentile_cont(0.5) within group (
              order by coalesce(trace.ttft_ms, trace.duration_ms)
            ) filter (where coalesce(trace.ttft_ms, trace.duration_ms) is not null) as latency_p50_ms,
            percentile_cont(0.95) within group (
              order by coalesce(trace.ttft_ms, trace.duration_ms)
            ) filter (where coalesce(trace.ttft_ms, trace.duration_ms) is not null) as latency_p95_ms,
            avg(coalesce(trace.provider_cost_microusd, usage.actual_cost_microusd))
              as cost_per_request_microusd
       from public.routing_decision_traces trace
       left join public.managed_usage_requests usage
         on trace.kind = 'served'
        and usage.user_id = trace.user_id
        and usage.idempotency_key = trace.request_id
      where trace.created_at >= $1
        and trace.created_at < $2
        and trace.status = 'selected'
        and trace.slot_id is not null
        and trace.model_key is not null
        and trace.outcome is not null
        and (trace.kind = 'shadow' or trace.cohort is not null)
      group by 1, 2, 3, 4`,
    [windowStart.toISOString(), windowEnd.toISOString()],
  );
  return rows.map((row) => {
    const samples = Number(row.samples);
    return {
      slotId: row.slot_id,
      cohort: row.cohort,
      modelKey: row.model_key,
      lifecycleStage: row.lifecycle_stage,
      samples,
      failureRate: samples > 0 ? Number(row.failures) / samples : null,
      latencyP50Ms: numberOrNull(row.latency_p50_ms),
      latencyP95Ms: numberOrNull(row.latency_p95_ms),
      costPerRequestMicrousd: numberOrNull(row.cost_per_request_microusd),
    };
  });
}

export interface RolloutAlert {
  kind: RolloutAlertKind;
  slotId: string;
  cohort: Exclude<RolloutCohort, 'control'>;
  candidateModelKey: string;
  controlModelKey: string;
  candidateValue: number;
  controlValue: number;
  samples: number;
}

function ratioBreached(candidate: number | null, control: number | null, ratio: number): boolean {
  return candidate !== null && control !== null && control > 0 && candidate > control * ratio;
}

/**
 * A candidate is judged only against the promoted model serving the same slot
 * in the same window, and only once both sides carry enough samples, so a slow
 * hour for everyone or a single failed request never pages anyone.
 */
export function detectRolloutAlerts(
  metrics: readonly CohortMetrics[],
  config: RolloutEvaluationConfig,
): RolloutAlert[] {
  const alerts: RolloutAlert[] = [];
  const controls = new Map(
    metrics.filter((entry) => entry.cohort === 'control').map((entry) => [entry.slotId, entry]),
  );
  for (const candidate of metrics) {
    if (candidate.cohort === 'control') continue;
    const control = controls.get(candidate.slotId);
    if (!control) continue;
    if (candidate.samples < config.minimumSamples || control.samples < config.minimumSamples) {
      continue;
    }
    const base = {
      slotId: candidate.slotId,
      cohort: candidate.cohort,
      candidateModelKey: candidate.modelKey,
      controlModelKey: control.modelKey,
      samples: candidate.samples,
    };
    if (
      candidate.failureRate !== null &&
      control.failureRate !== null &&
      candidate.failureRate - control.failureRate > config.failureRateIncrease
    ) {
      alerts.push({
        ...base,
        kind: 'quality',
        candidateValue: candidate.failureRate,
        controlValue: control.failureRate,
      });
    }
    if (ratioBreached(candidate.latencyP50Ms, control.latencyP50Ms, config.latencyRatio)) {
      alerts.push({
        ...base,
        kind: 'latency',
        candidateValue: candidate.latencyP50Ms ?? 0,
        controlValue: control.latencyP50Ms ?? 0,
      });
    }
    if (
      ratioBreached(
        candidate.costPerRequestMicrousd,
        control.costPerRequestMicrousd,
        config.costRatio,
      )
    ) {
      alerts.push({
        ...base,
        kind: 'cost',
        candidateValue: candidate.costPerRequestMicrousd ?? 0,
        controlValue: control.costPerRequestMicrousd ?? 0,
      });
    }
  }
  return alerts;
}

export async function recordRolloutBenchmarks(
  metrics: readonly CohortMetrics[],
  windowStart: Date,
  windowEnd: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<number> {
  let recorded = 0;
  for (const entry of metrics) {
    if (!entry.lifecycleStage) continue;
    recorded += await db.execute(
      `insert into public.model_rollout_benchmarks (
         model_key, lifecycle_stage, slot_id, cohort, window_start, window_end, sample_count,
         failure_rate, latency_p50_ms, latency_p95_ms, cost_per_request_microusd
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (model_key, lifecycle_stage, cohort, coalesce(slot_id, ''), window_start)
       do update set window_end = excluded.window_end, sample_count = excluded.sample_count,
                     failure_rate = excluded.failure_rate,
                     latency_p50_ms = excluded.latency_p50_ms,
                     latency_p95_ms = excluded.latency_p95_ms,
                     cost_per_request_microusd = excluded.cost_per_request_microusd`,
      [
        entry.modelKey,
        entry.lifecycleStage,
        entry.slotId,
        entry.cohort,
        windowStart.toISOString(),
        windowEnd.toISOString(),
        entry.samples,
        entry.failureRate,
        entry.latencyP50Ms === null ? null : Math.round(entry.latencyP50Ms),
        entry.latencyP95Ms === null ? null : Math.round(entry.latencyP95Ms),
        entry.costPerRequestMicrousd === null ? null : Math.round(entry.costPerRequestMicrousd),
      ],
    );
  }
  return recorded;
}

export async function purgeExpiredRoutingTraces(
  config: RolloutEvaluationConfig,
  nowMs: number,
  db: DatabaseAdapter = getNeonDb(),
): Promise<number> {
  const cutoff = new Date(nowMs - config.traceRetentionDays * 24 * 60 * 60 * 1000);
  return db.execute(
    `delete from public.routing_decision_traces
      where id in (
        select id from public.routing_decision_traces
         where created_at < $1
         order by created_at
         limit $2
      )`,
    [cutoff.toISOString(), Math.round(config.retentionBatchSize)],
  );
}

export interface ModelBenchmarkRow {
  modelKey: string;
  lifecycleStage: string;
  slotId: string | null;
  cohort: RolloutCohort;
  windowStart: string;
  windowEnd: string;
  sampleCount: number;
  failureRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  costPerRequestMicrousd: number | null;
}

export async function listRecentRolloutBenchmarks(
  limit: number,
  db: DatabaseAdapter = getNeonDb(),
): Promise<ModelBenchmarkRow[]> {
  const rows = await db.query<{
    model_key: string;
    lifecycle_stage: string;
    slot_id: string | null;
    cohort: RolloutCohort;
    window_start: string | Date;
    window_end: string | Date;
    sample_count: number;
    failure_rate: string | number | null;
    latency_p50_ms: number | null;
    latency_p95_ms: number | null;
    cost_per_request_microusd: string | number | null;
  }>(
    `select model_key, lifecycle_stage, slot_id, cohort, window_start, window_end, sample_count,
            failure_rate, latency_p50_ms, latency_p95_ms, cost_per_request_microusd
       from public.model_rollout_benchmarks
      order by window_end desc, model_key, cohort
      limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    modelKey: row.model_key,
    lifecycleStage: row.lifecycle_stage,
    slotId: row.slot_id,
    cohort: row.cohort,
    windowStart: new Date(row.window_start).toISOString(),
    windowEnd: new Date(row.window_end).toISOString(),
    sampleCount: Number(row.sample_count),
    failureRate: numberOrNull(row.failure_rate),
    latencyP50Ms: row.latency_p50_ms,
    latencyP95Ms: row.latency_p95_ms,
    costPerRequestMicrousd: numberOrNull(row.cost_per_request_microusd),
  }));
}
