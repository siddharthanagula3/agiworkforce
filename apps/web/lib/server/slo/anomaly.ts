import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { findOperationalDomain, type OperationalDomain } from '@/lib/observability/ownership';
import { getNeonDb } from '@/lib/server/neon-db';

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const MEASURED_PERCENTILE = 0.95;

export type AnomalySeriesId = 'turn-cost' | 'turn-latency' | 'turn-time-to-first-token';

export type AnomalySeverity = 'critical' | 'warning';

/**
 * A reading that has no fixed target, only a normal. An objective answers "is
 * this good enough"; these answer "is this what it was yesterday". Cost has no
 * threshold anyone could set once and keep, because a prompt-cache regression
 * doubles spend while every request still succeeds, so nothing an availability
 * or latency objective measures moves at all.
 */
export interface AnomalySeries {
  readonly id: AnomalySeriesId;
  /** The objective whose operational domain answers for this series. */
  readonly sloId: string;
  readonly table: string;
  readonly occurredAt: string;
  readonly eligible: string;
  readonly value: string;
  readonly unit: 'uUSD' | 'ms';
  readonly statement: string;
  /** Multiples of the baseline that page, and that warn. */
  readonly criticalRatio: number;
  readonly warningRatio: number;
}

const SERVED_TURN_WITH = (column: string): string =>
  `kind = 'served' and ${column} is not null and ${column} > 0`;

export const ANOMALY_SERIES: readonly AnomalySeries[] = [
  {
    id: 'turn-cost',
    sloId: 'billing-usage',
    table: 'routing_decision_traces',
    occurredAt: 'created_at',
    eligible: SERVED_TURN_WITH('provider_cost_microusd'),
    value: 'provider_cost_microusd',
    unit: 'uUSD',
    statement:
      'What a served turn costs the platform. A prompt-cache regression, a silent route change or a model swap all land here first.',
    criticalRatio: 2,
    warningRatio: 1.5,
  },
  {
    id: 'turn-latency',
    sloId: 'completion',
    table: 'routing_decision_traces',
    occurredAt: 'created_at',
    eligible: SERVED_TURN_WITH('duration_ms'),
    value: 'duration_ms',
    unit: 'ms',
    statement:
      'How long a served turn takes end to end, against its own recent normal rather than the completion deadline.',
    criticalRatio: 2,
    warningRatio: 1.5,
  },
  {
    id: 'turn-time-to-first-token',
    sloId: 'first-token',
    table: 'routing_decision_traces',
    occurredAt: 'created_at',
    eligible: SERVED_TURN_WITH('ttft_ms'),
    value: 'ttft_ms',
    unit: 'ms',
    statement:
      'How long a served turn takes to start streaming, against its own recent normal rather than the first-token deadline.',
    criticalRatio: 2,
    warningRatio: 1.5,
  },
];

export const ANOMALY_RECENT_HOURS = 1;
export const ANOMALY_BASELINE_DAYS = 7;
export const ANOMALY_MIN_SAMPLES = 50;

export interface AnomalyReading {
  samples: number;
  /** p95 of the series over the window, or null when the window holds no sample. */
  measured: number | null;
}

export interface AnomalyAlert {
  id: AnomalySeriesId;
  sloId: string;
  unit: AnomalySeries['unit'];
  statement: string;
  severity: AnomalySeverity;
  recent: number;
  baseline: number;
  /** How many times the baseline the recent window reached. */
  ratio: number;
  threshold: number;
  samples: number;
  baselineSamples: number;
  /** Stable while the same series deviates at the same severity. */
  dedupeKey: string;
  owner: OperationalDomain | null;
}

interface AnomalyRow {
  samples: string | number | null;
  measured: string | number | null;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
}

function readingQuery(series: AnomalySeries): string {
  return `select
       count(*) filter (where ${series.eligible})::bigint as samples,
       percentile_cont(${MEASURED_PERCENTILE}) within group (order by ${series.value})
         filter (where ${series.eligible}) as measured
     from public.${series.table}
     where ${series.occurredAt} >= $1::timestamptz
       and ${series.occurredAt} < $2::timestamptz`;
}

export async function measureAnomalySeries(
  series: AnomalySeries,
  from: Date,
  to: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<AnomalyReading> {
  const rows = await db.query<AnomalyRow>(readingQuery(series), [
    from.toISOString(),
    to.toISOString(),
  ]);
  const row = rows[0];
  return {
    samples: toNumber(row?.samples ?? 0) ?? 0,
    measured: toNumber(row?.measured ?? null),
  };
}

function severityFor(series: AnomalySeries, ratio: number): AnomalySeverity | null {
  if (ratio >= series.criticalRatio) return 'critical';
  if (ratio >= series.warningRatio) return 'warning';
  return null;
}

/**
 * The recent window against the week behind it, excluding the recent window so
 * the spike cannot raise its own baseline. Both sides need enough samples: a
 * quiet hour whose single expensive turn doubles the p95 is noise, and an alert
 * that fires on noise is one nobody reads.
 */
export async function evaluateAnomalies(
  now: Date = new Date(),
  db: DatabaseAdapter = getNeonDb(),
): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const recentFrom = new Date(now.getTime() - ANOMALY_RECENT_HOURS * HOUR_MS);
  const baselineFrom = new Date(recentFrom.getTime() - ANOMALY_BASELINE_DAYS * DAY_MS);

  for (const series of ANOMALY_SERIES) {
    const recent = await measureAnomalySeries(series, recentFrom, now, db);
    if (recent.samples < ANOMALY_MIN_SAMPLES || recent.measured === null) continue;

    const baseline = await measureAnomalySeries(series, baselineFrom, recentFrom, db);
    if (baseline.samples < ANOMALY_MIN_SAMPLES || baseline.measured === null) continue;
    if (baseline.measured <= 0) continue;

    const ratio = recent.measured / baseline.measured;
    const severity = severityFor(series, ratio);
    if (severity === null) continue;

    alerts.push({
      id: series.id,
      sloId: series.sloId,
      unit: series.unit,
      statement: series.statement,
      severity,
      recent: recent.measured,
      baseline: baseline.measured,
      ratio,
      threshold: severity === 'critical' ? series.criticalRatio : series.warningRatio,
      samples: recent.samples,
      baselineSamples: baseline.samples,
      dedupeKey: `slo-anomaly:${series.id}:${severity}`,
      owner: findOperationalDomain(series.sloId),
    });
  }

  return alerts;
}

const RATIO_DECIMALS = 2;

export function describeAnomaly(alert: AnomalyAlert): string {
  const ratio = alert.ratio.toFixed(RATIO_DECIMALS);
  const recent = Math.round(alert.recent);
  const baseline = Math.round(alert.baseline);
  return `- ${alert.id}: p95 ${recent}${alert.unit} over the last ${ANOMALY_RECENT_HOURS}h on ${alert.samples} samples, ${ratio}x the ${ANOMALY_BASELINE_DAYS}-day baseline of ${baseline}${alert.unit} (threshold ${alert.threshold}x)`;
}
