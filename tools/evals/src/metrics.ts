/**
 * Cost and latency, the two axes every suite reports beside its score.
 *
 * Both are summarised only from what the provider layer metered. A case with
 * no metered cost or timing is counted out rather than as zero, so an unmetered
 * run reports `null` instead of a cost of nothing.
 *
 * @module evals/metrics
 * @packageDocumentation
 */

import type {
  CaseResult,
  CostSummary,
  LatencySummary,
  RetrySummary,
  SliceSummary,
  SuiteSlices,
} from './types';

export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1]!;
}

export function summariseCost(cases: readonly CaseResult[]): CostSummary {
  const metered = cases
    .map((entry) => entry.response.costUsd)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const totalUsd = metered.length === 0 ? null : metered.reduce((sum, value) => sum + value, 0);
  return {
    meteredCases: metered.length,
    totalUsd,
    meanUsd: totalUsd === null ? null : totalUsd / metered.length,
    inputTokens: cases.reduce((sum, entry) => sum + (entry.response.usage?.inputTokens ?? 0), 0),
    outputTokens: cases.reduce((sum, entry) => sum + (entry.response.usage?.outputTokens ?? 0), 0),
  };
}

export function summariseCompleteness(cases: readonly CaseResult[]): number {
  if (cases.length === 0) return 0;
  return cases.reduce((sum, entry) => sum + entry.completeness, 0) / cases.length;
}

function summariseSlice(cases: readonly CaseResult[]): SliceSummary {
  const passed = cases.filter((entry) => entry.passed).length;
  return {
    total: cases.length,
    passed,
    score: cases.length === 0 ? 0 : passed / cases.length,
    completeness: summariseCompleteness(cases),
  };
}

function sliceBy(
  cases: readonly CaseResult[],
  key: (entry: CaseResult) => string,
): Record<string, SliceSummary> {
  const buckets = new Map<string, CaseResult[]>();
  for (const entry of cases) {
    const bucket = buckets.get(key(entry));
    if (bucket === undefined) buckets.set(key(entry), [entry]);
    else bucket.push(entry);
  }
  return Object.fromEntries(
    [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, rows]) => [name, summariseSlice(rows)]),
  );
}

export function summariseSlices(cases: readonly CaseResult[]): SuiteSlices {
  return {
    family: sliceBy(cases, (entry) => entry.family),
    risk: sliceBy(cases, (entry) => entry.risk),
  };
}

/**
 * What the run paid for answers it then threw away. A retried attempt that
 * reported usage before it failed is charged; one that failed before the
 * provider metered anything is counted but leaves the cost unknown rather than
 * claiming it was free.
 */
export function summariseRetries(attempts: readonly RetryCost[]): RetrySummary {
  const retried = attempts.filter((entry) => !entry.graded);
  const metered = retried
    .map((entry) => entry.costUsd)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return {
    attempts: attempts.length,
    retried: retried.length,
    retryCostUsd: metered.length === 0 ? null : metered.reduce((sum, value) => sum + value, 0),
  };
}

export interface RetryCost {
  readonly graded: boolean;
  readonly costUsd: number | null;
}

export function summariseLatency(cases: readonly CaseResult[]): LatencySummary {
  const latencies = cases
    .map((entry) => entry.response.latencyMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const ttfb = cases
    .map((entry) => entry.response.ttfbMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return {
    timedCases: latencies.length,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    ttfbP50Ms: percentile(ttfb, 0.5),
  };
}
