import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { getNeonDb } from '@/lib/server/neon-db';
import {
  cachedRenderInput,
  RENDER_CACHE_SECONDS,
  RENDER_CACHE_TAGS,
} from '@/lib/server/render-cache';

import { SLO_CATALOGUE, type SloDefinition } from './catalogue';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const LATENCY_PERCENTILE = 0.95;

export interface SloAttainment {
  id: string;
  domain: string;
  kind: SloDefinition['kind'];
  objective: number;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  samples: number;
  good: number;
  /** Null when the window holds no sample, which is not the same as zero. */
  attainment: number | null;
  errorBudgetRemaining: number | null;
  latencyP95Ms: number | null;
}

interface AttainmentRow {
  eligible: string | number | null;
  good: string | number | null;
  latency_p95_ms: string | number | null;
}

function toCount(value: AttainmentRow['eligible']): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

function toLatency(value: AttainmentRow['latency_p95_ms']): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function attainmentQuery(definition: SloDefinition): string {
  const source = definition.source;
  if (!source) throw new Error(`SLO ${definition.id} has no indicator source`);
  const latency = source.latencyMs
    ? `percentile_cont(${LATENCY_PERCENTILE}) within group (order by ${source.latencyMs})
         filter (where (${source.eligible}) and ${source.latencyMs} is not null)`
    : 'null::numeric';

  return `select
       count(*) filter (where ${source.eligible})::bigint as eligible,
       count(*) filter (where (${source.eligible}) and (${source.good}))::bigint as good,
       ${latency} as latency_p95_ms
     from public.${source.table}
     where ${source.occurredAt} >= $1::timestamptz
       and ${source.occurredAt} < $2::timestamptz`;
}

function parameters(definition: SloDefinition, from: Date, to: Date): unknown[] {
  const base: unknown[] = [from.toISOString(), to.toISOString()];
  return definition.thresholdMs === undefined ? base : [...base, definition.thresholdMs];
}

export async function measureSlo(
  definition: SloDefinition,
  from: Date,
  to: Date,
  db: DatabaseAdapter = getNeonDb(),
): Promise<SloAttainment> {
  const rows = await db.query<AttainmentRow>(
    attainmentQuery(definition),
    parameters(definition, from, to),
  );
  const row = rows[0];
  const samples = toCount(row?.eligible ?? 0);
  const good = toCount(row?.good ?? 0);
  const attainment = samples > 0 ? good / samples : null;
  const errorBudget = 1 - definition.objective;

  return {
    id: definition.id,
    domain: definition.domain,
    kind: definition.kind,
    objective: definition.objective,
    windowDays: definition.windowDays,
    windowStart: from.toISOString(),
    windowEnd: to.toISOString(),
    samples,
    good,
    attainment,
    errorBudgetRemaining:
      attainment === null || errorBudget <= 0
        ? null
        : Math.max(0, 1 - (1 - attainment) / errorBudget),
    latencyP95Ms: toLatency(row?.latency_p95_ms ?? null),
  };
}

export async function measureSloCatalogue(
  now: Date = new Date(),
  db: DatabaseAdapter = getNeonDb(),
): Promise<SloAttainment[]> {
  const measured: SloAttainment[] = [];
  for (const definition of SLO_CATALOGUE) {
    if (!definition.source) continue;
    const from = new Date(now.getTime() - definition.windowDays * MILLISECONDS_PER_DAY);
    measured.push(await measureSlo(definition, from, now, db));
  }
  return measured;
}

export type BurnWindow = 'fast' | 'slow';

export interface BurnRateThreshold {
  window: BurnWindow;
  hours: number;
  /** Multiples of the monthly budget per hour that count as burning. */
  burnRate: number;
  severity: 'critical' | 'warning';
}

/**
 * The two-window rule: a fast burn empties a month of budget inside two days
 * and pages; a slow burn empties it inside five and warns. A single window
 * either misses a sharp outage or pages for a blip, which is how an alert
 * stops being read.
 */
export const BURN_RATE_THRESHOLDS: readonly BurnRateThreshold[] = [
  { window: 'fast', hours: 1, burnRate: 14.4, severity: 'critical' },
  { window: 'slow', hours: 6, burnRate: 6, severity: 'warning' },
];

export const BURN_RATE_MIN_SAMPLES = 20;

export interface BurnRateAlert {
  id: string;
  domain: string;
  window: BurnWindow;
  hours: number;
  burnRate: number;
  threshold: number;
  samples: number;
  attainment: number;
  severity: BurnRateThreshold['severity'];
}

export function burnRateOf(attainment: SloAttainment, objective: number): number | null {
  if (attainment.attainment === null) return null;
  const errorBudget = 1 - objective;
  if (errorBudget <= 0) return null;
  return (1 - attainment.attainment) / errorBudget;
}

export async function evaluateBurnRates(
  now: Date = new Date(),
  db: DatabaseAdapter = getNeonDb(),
): Promise<BurnRateAlert[]> {
  const alerts: BurnRateAlert[] = [];

  for (const definition of SLO_CATALOGUE) {
    if (!definition.source) continue;
    for (const threshold of BURN_RATE_THRESHOLDS) {
      const from = new Date(now.getTime() - threshold.hours * HOUR_MS);
      const measured = await measureSlo(definition, from, now, db);
      if (measured.samples < BURN_RATE_MIN_SAMPLES) continue;
      const burnRate = burnRateOf(measured, definition.objective);
      if (burnRate === null || burnRate < threshold.burnRate) continue;
      alerts.push({
        id: definition.id,
        domain: definition.domain,
        window: threshold.window,
        hours: threshold.hours,
        burnRate,
        threshold: threshold.burnRate,
        samples: measured.samples,
        attainment: measured.attainment ?? 0,
        severity: threshold.severity,
      });
    }
  }

  return alerts;
}

/**
 * The status page's copy of the attainment, computed once per window for
 * everyone. Each measured domain costs one aggregate over a month of rows, so
 * running it per page view would make a public page a load generator against
 * the primary database at exactly the moment people refresh it.
 */
export const getCachedSloAttainment = cachedRenderInput(() => measureSloCatalogue(), {
  keyParts: ['status-page', 'slo-attainment'],
  tags: [RENDER_CACHE_TAGS.sloAttainment],
  revalidate: RENDER_CACHE_SECONDS.catalog,
});
