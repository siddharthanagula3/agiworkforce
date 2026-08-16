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
import type { CaseResult, EvalDataset, Responder, SuiteReport } from './types';

export async function runSuite(dataset: EvalDataset, respond: Responder): Promise<SuiteReport> {
  const cases: CaseResult[] = [];
  for (const evalCase of dataset.cases) {
    cases.push(gradeCase(evalCase, await respond(evalCase)));
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
    met: score >= dataset.passThreshold,
    cases,
  };
}

export function formatReport(report: SuiteReport): string {
  const header = `${report.suite} v${report.version}: ${report.passed}/${report.total} passed (score ${report.score.toFixed(3)}, threshold ${report.threshold})`;
  const failures = report.cases.filter((result) => !result.passed);
  if (failures.length === 0) return header;

  const lines = failures.flatMap((result) => {
    const reasons = result.checks
      .filter((check) => !check.passed)
      .map((check) => `${check.check.kind}: ${check.detail}`)
      .join('; ');
    const row = `  - ${result.id} [${result.family}/${result.risk}] ${reasons}`;
    return result.notes === undefined ? [row] : [row, `    why this row: ${result.notes}`];
  });
  return [header, ...lines].join('\n');
}
