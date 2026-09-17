/**
 * The per-run report, the file a baseline is made from and a gate reads.
 *
 * @module evals/report
 * @packageDocumentation
 */

import { formatReport } from './suite';
import type { CostSummary, LatencySummary, SkippedCase, SuiteName, SuiteReport } from './types';

export const RUN_REPORT_SCHEMA_VERSION = 1;

export type RunSource = 'live' | 'replay';

export interface SuiteSummary {
  readonly version: number;
  readonly threshold: number;
  readonly total: number;
  readonly passed: number;
  readonly score: number;
  readonly met: boolean;
  readonly cost: CostSummary;
  readonly latency: LatencySummary;
  readonly skipped: readonly SkippedCase[];
  readonly failed: readonly string[];
}

export interface RunReport {
  readonly schemaVersion: number;
  readonly source: RunSource;
  readonly recordingSource: 'live' | 'reference';
  readonly modelKey: string | null;
  readonly routeId: string | null;
  readonly recordedOn: string | null;
  readonly suites: Partial<Record<SuiteName, SuiteSummary>>;
  readonly unsupportedSuites: Partial<Record<SuiteName, string>>;
}

export interface RunIdentity {
  readonly source: RunSource;
  readonly recordingSource: 'live' | 'reference';
  readonly modelKey: string | null;
  readonly routeId: string | null;
  readonly recordedOn: string | null;
}

export function summariseSuite(report: SuiteReport): SuiteSummary {
  return {
    version: report.version,
    threshold: report.threshold,
    total: report.total,
    passed: report.passed,
    score: report.score,
    met: report.met,
    cost: report.cost,
    latency: report.latency,
    skipped: report.skipped,
    failed: report.cases.filter((entry) => !entry.passed).map((entry) => entry.id),
  };
}

export function buildRunReport(
  identity: RunIdentity,
  reports: readonly SuiteReport[],
  unsupportedSuites: Partial<Record<SuiteName, string>> = {},
): RunReport {
  return {
    schemaVersion: RUN_REPORT_SCHEMA_VERSION,
    ...identity,
    suites: Object.fromEntries(reports.map((report) => [report.suite, summariseSuite(report)])),
    unsupportedSuites,
  };
}

export function formatRun(identity: RunIdentity, reports: readonly SuiteReport[]): string {
  const title = `[evals] ${identity.source} run of ${identity.modelKey ?? 'reference responses'}${identity.routeId === null ? '' : ` via ${identity.routeId}`}`;
  return [title, ...reports.map((report) => formatReport(report))].join('\n');
}
