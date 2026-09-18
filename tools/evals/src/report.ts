/**
 * The per-run report, the file a baseline is made from and a gate reads.
 *
 * @module evals/report
 * @packageDocumentation
 */

import { formatReport } from './suite';
import type {
  CorpusPriority,
  CostSummary,
  DatasetProvenance,
  LatencySummary,
  RetrySummary,
  SkippedCase,
  SuiteName,
  SuiteReport,
  SuiteSlices,
} from './types';

export const RUN_REPORT_SCHEMA_VERSION = 2;

export type RunSource = 'live' | 'replay';

export interface SuiteSummary {
  readonly version: number;
  readonly priority: CorpusPriority;
  readonly provenance: DatasetProvenance;
  readonly threshold: number;
  readonly total: number;
  readonly passed: number;
  readonly score: number;
  /**
   * Null on a report migrated from schema 1, which recorded pass/fail only:
   * completeness cannot be recovered from a score, and claiming a number for it
   * would invent a measurement.
   */
  readonly completeness: number | null;
  readonly met: boolean;
  /**
   * When this score was measured, per suite rather than per run: a run report
   * is the index a later comparison queries, and a score with no date of its
   * own cannot be aged out.
   */
  readonly measuredAt: string;
  readonly cost: CostSummary;
  readonly latency: LatencySummary;
  readonly retries: RetrySummary | null;
  readonly slices: SuiteSlices | null;
  readonly skipped: readonly SkippedCase[];
  readonly failed: readonly string[];
}

export interface RunReport {
  readonly schemaVersion: number;
  readonly source: RunSource;
  readonly recordingSource: 'live' | 'reference';
  readonly runId: string | null;
  readonly modelKey: string | null;
  readonly routeId: string | null;
  readonly recordedOn: string | null;
  readonly measuredAt: string;
  readonly suites: Partial<Record<SuiteName, SuiteSummary>>;
  readonly unsupportedSuites: Partial<Record<SuiteName, string>>;
}

export interface RunIdentity {
  readonly source: RunSource;
  readonly recordingSource: 'live' | 'reference';
  /**
   * The correlation id every attempt in this run carries, and the one the
   * provider request is tagged with, so a row in a run report can be found in
   * the provider and routing logs of the call that produced it.
   */
  readonly runId: string | null;
  readonly modelKey: string | null;
  readonly routeId: string | null;
  readonly recordedOn: string | null;
}

export function summariseSuite(report: SuiteReport): SuiteSummary {
  return {
    version: report.version,
    priority: report.priority,
    provenance: report.provenance,
    threshold: report.threshold,
    total: report.total,
    passed: report.passed,
    score: report.score,
    completeness: report.completeness,
    met: report.met,
    measuredAt: report.measuredAt,
    cost: report.cost,
    latency: report.latency,
    retries: report.retries,
    slices: report.slices,
    skipped: report.skipped,
    failed: report.cases.filter((entry) => !entry.passed).map((entry) => entry.id),
  };
}

export function buildRunReport(
  identity: RunIdentity,
  reports: readonly SuiteReport[],
  unsupportedSuites: Partial<Record<SuiteName, string>> = {},
  measuredAt: string = new Date().toISOString(),
): RunReport {
  return {
    schemaVersion: RUN_REPORT_SCHEMA_VERSION,
    ...identity,
    measuredAt,
    suites: Object.fromEntries(reports.map((report) => [report.suite, summariseSuite(report)])),
    unsupportedSuites,
  };
}

export function formatRun(identity: RunIdentity, reports: readonly SuiteReport[]): string {
  const title = `[evals] ${identity.source} run of ${identity.modelKey ?? 'reference responses'}${identity.routeId === null ? '' : ` via ${identity.routeId}`}`;
  return [title, ...reports.map((report) => formatReport(report))].join('\n');
}
