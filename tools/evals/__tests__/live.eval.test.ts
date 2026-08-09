/**
 * The measurement itself: every corpus through a live model.
 *
 * Gated on AGIWORKFORCE_LIVE_TEST=1 + ANTHROPIC_API_KEY, the same gate the
 * provider live tests use, because this one costs money and needs the network.
 * Everything else under `tools/evals` tests the harness; this is the only test
 * whose score says anything about a model.
 */

import { describe, expect, it } from 'vitest';

import { anthropicResponder, readModelCatalog, resolveAnthropicModel } from '../src/anthropic';
import { loadAllDatasets } from '../src/dataset';
import { formatReport, runSuite } from '../src/suite';

const liveEnabled = process.env['AGIWORKFORCE_LIVE_TEST'] === '1';
const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
const skip = !liveEnabled || apiKey.length === 0;

// One call per row, sequential, over three corpora.
const SUITE_TIMEOUT_MS = 15 * 60 * 1000;

// llm-guardrail-allow: paid live-network call, gated by AGIWORKFORCE_LIVE_TEST
describe.skipIf(skip)('live output quality', () => {
  it.each(loadAllDatasets())(
    'meets the $suite gate',
    async (dataset) => {
      // Built per test rather than in the describe body: a describe body runs
      // even when the suite is skipped, and the key is only present on a live
      // run.
      const model = resolveAnthropicModel(readModelCatalog());
      const respond = anthropicResponder({ apiKey, apiModelId: model.apiModelId });

      const report = await runSuite(dataset, respond);
      // The score is the deliverable: print it whether or not the gate is met,
      // so a run that passes still leaves the number behind in the CI log.
      // eslint-disable-next-line no-console -- the printed score is the output of this job
      console.info(`[evals] model ${model.id}\n${formatReport(report)}`);
      expect(report.met, formatReport(report)).toBe(true);
    },
    SUITE_TIMEOUT_MS,
  );
});
