/**
 * Suite runner and gate.
 *
 * `runSuite` is the only place a pass rate is computed, and `SuiteReport.met`
 * is the only value a caller is meant to branch on, so the threshold cannot
 * drift between the offline harness run and a live run.
 *
 * @module evals/suite
 * @packageDocumentation
 */

import { gradeCase } from './grader';
import {
  summariseCompleteness,
  summariseCost,
  summariseLatency,
  summariseRetries,
  summariseSlices,
  type RetryCost,
} from './metrics';
import type {
  CaseResult,
  EvalCase,
  EvalDataset,
  Responder,
  SkippedCase,
  SuiteReport,
} from './types';

export interface RunSuiteOptions {
  readonly skip?: (evalCase: EvalCase) => string | null;
  /**
   * Every attempt the responder made, read once the suite has run. A responder
   * that retries reports the discarded attempts here so the run can price them.
   */
  readonly attempts?: () => readonly RetryCost[];
  readonly now?: () => Date;
}

export async function runSuite(
  dataset: EvalDataset,
  respond: Responder,
  options: RunSuiteOptions = {},
): Promise<SuiteReport> {
  const cases: CaseResult[] = [];
  const skipped: SkippedCase[] = [];
  for (const evalCase of dataset.cases) {
    const reason = options.skip?.(evalCase) ?? null;
    if (reason !== null) {
      skipped.push({ id: evalCase.id, reason });
      continue;
    }
    cases.push(await gradeCase(evalCase, await respond(evalCase)));
  }

  const passed = cases.filter((result) => result.passed).length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  const attempts =
    options.attempts?.() ?? cases.map(() => ({ graded: true, costUsd: null }) as RetryCost);

  return {
    suite: dataset.suite,
    version: dataset.version,
    priority: dataset.priority,
    provenance: dataset.provenance,
    ...(dataset.promptId === undefined ? {} : { promptId: dataset.promptId }),
    threshold: dataset.passThreshold,
    total: cases.length,
    passed,
    score,
    completeness: summariseCompleteness(cases),
    met: cases.length > 0 && score >= dataset.passThreshold,
    measuredAt: (options.now?.() ?? new Date()).toISOString(),
    cost: summariseCost(cases),
    latency: summariseLatency(cases),
    retries: summariseRetries(attempts),
    slices: summariseSlices(cases),
    skipped,
    cases,
  };
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

export function weakSlices(report: SuiteReport): readonly string[] {
  return Object.entries(report.slices).flatMap(([axis, buckets]) =>
    Object.entries(buckets)
      .filter(([, slice]) => slice.score < report.score)
      .map(
        ([name, slice]) =>
          `  slice ${axis}=${name}: ${slice.passed}/${slice.total} (score ${slice.score.toFixed(3)} against suite ${report.score.toFixed(3)})`,
      ),
  );
}

export function formatReport(report: SuiteReport): string {
  const header = `${report.suite} v${report.version} [${report.priority}]: ${report.passed}/${report.total} passed (score ${report.score.toFixed(3)}, completeness ${report.completeness.toFixed(3)}, threshold ${report.threshold})`;
  const axes: string[] = [...weakSlices(report)];
  if (report.retries.retried > 0) {
    const spent =
      report.retries.retryCostUsd === null
        ? 'unmetered'
        : `$${report.retries.retryCostUsd.toFixed(6)}`;
    axes.push(
      `  retries: ${report.retries.retried} of ${report.retries.attempts} attempts discarded, ${spent}`,
    );
  }
  if (report.cost.totalUsd !== null && report.cost.meanUsd !== null) {
    axes.push(
      `  cost: ${formatUsd(report.cost.totalUsd)} total, ${formatUsd(report.cost.meanUsd)} per case over ${report.cost.meteredCases} metered, ${report.cost.inputTokens} in / ${report.cost.outputTokens} out tokens`,
    );
  }
  if (report.latency.p50Ms !== null) {
    axes.push(
      `  latency: p50 ${report.latency.p50Ms} ms, p95 ${report.latency.p95Ms} ms, ttfb p50 ${report.latency.ttfbP50Ms ?? 'n/a'} ms over ${report.latency.timedCases} timed`,
    );
  }
  const skipped = report.skipped.map((entry) => `  ~ skipped ${entry.id}: ${entry.reason}`);
  const failures = report.cases.filter((result) => !result.passed);

  const lines = failures.flatMap((result) => {
    const reasons = result.checks
      .filter((check) => !check.passed)
      .map((check) => `${check.check.kind}: ${check.detail}`)
      .join('; ');
    const row = `  - ${result.id} [${result.family}/${result.risk}] ${reasons}`;
    return result.notes === undefined ? [row] : [row, `    why this row: ${result.notes}`];
  });
  return [header, ...axes, ...skipped, ...lines].join('\n');
}
