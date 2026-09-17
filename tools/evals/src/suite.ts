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
import { summariseCost, summariseLatency } from './metrics';
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

  return {
    suite: dataset.suite,
    version: dataset.version,
    threshold: dataset.passThreshold,
    total: cases.length,
    passed,
    score,
    met: cases.length > 0 && score >= dataset.passThreshold,
    cost: summariseCost(cases),
    latency: summariseLatency(cases),
    skipped,
    cases,
  };
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

export function formatReport(report: SuiteReport): string {
  const header = `${report.suite} v${report.version}: ${report.passed}/${report.total} passed (score ${report.score.toFixed(3)}, threshold ${report.threshold})`;
  const axes: string[] = [];
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
