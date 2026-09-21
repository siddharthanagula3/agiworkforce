import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadAllDatasets } from '../src/dataset';
import { parseRecording, replayResponder } from '../src/replay';
import { runSuite } from '../src/suite';
import type { EvalDataset, Responder } from '../src/types';

// Every row and every check counts once; the only release numbers are corpus thresholds and
// gate-policy.json tolerances, which scripts/check-eval-gate-policy.mjs holds to the gate.
const datasets = loadAllDatasets();
const reference = parseRecording(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../recordings/reference.json', import.meta.url)), 'utf8'),
  ),
);

function alternating(dataset: EvalDataset): Responder {
  const answered = new Set(dataset.cases.filter((_, index) => index % 2 === 0).map((c) => c.id));
  const correct = replayResponder(reference, dataset);
  return async (evalCase, attempt) =>
    answered.has(evalCase.id) ? correct(evalCase, attempt) : { text: '' };
}

describe('eval scores are unweighted', () => {
  it.each(datasets.map((dataset) => [dataset.suite, dataset] as const))(
    '%s: the score is the share of rows that passed, every slice alike',
    async (_suite, dataset) => {
      const report = await runSuite(dataset, alternating(dataset), {
        now: () => new Date('2026-09-21T00:00:00.000Z'),
      });

      expect(report.total).toBe(dataset.cases.length);
      const passed = report.cases.filter((entry) => entry.passed).length;
      expect(report.score).toBeCloseTo(passed / report.total, 12);

      const meanCompleteness =
        report.cases.reduce(
          (sum, entry) =>
            sum + entry.checks.filter((check) => check.passed).length / entry.checks.length,
          0,
        ) / report.total;
      expect(report.completeness).toBeCloseTo(meanCompleteness, 12);

      for (const [axis, buckets] of Object.entries(report.slices)) {
        for (const [name, slice] of Object.entries(buckets)) {
          const rows = report.cases.filter(
            (entry) => (axis === 'family' ? entry.family : entry.risk) === name,
          );
          expect(slice.total, `${axis}=${name}`).toBe(rows.length);
          expect(slice.score, `${axis}=${name}`).toBeCloseTo(
            rows.filter((entry) => entry.passed).length / rows.length,
            12,
          );
        }
      }
    },
  );

  it('exercises mixed outcomes, so a weighting would move at least one score', async () => {
    let mixed = 0;
    for (const dataset of datasets) {
      const report = await runSuite(dataset, alternating(dataset));
      const risks = new Set(report.cases.map((entry) => entry.risk));
      if (report.passed > 0 && report.passed < report.total && risks.size > 1) mixed += 1;
    }
    expect(mixed).toBeGreaterThan(0);
  });
});
