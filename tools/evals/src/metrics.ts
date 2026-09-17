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

import type { CaseResult, CostSummary, LatencySummary } from './types';

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
