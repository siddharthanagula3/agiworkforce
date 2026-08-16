
import { describe, expect, it } from 'vitest';

import { anthropicResponder, readModelCatalog, resolveAnthropicModel } from '../src/anthropic';
import { loadAllDatasets } from '../src/dataset';
import { formatReport, runSuite } from '../src/suite';

const liveEnabled = process.env['AGIWORKFORCE_LIVE_TEST'] === '1';
const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
const skip = !liveEnabled || apiKey.length === 0;

const SUITE_TIMEOUT_MS = 15 * 60 * 1000;

// llm-guardrail-allow: paid live-network call, gated by AGIWORKFORCE_LIVE_TEST
describe.skipIf(skip)('live output quality', () => {
  it.each(loadAllDatasets())(
    'meets the $suite gate',
    async (dataset) => {
      const model = resolveAnthropicModel(readModelCatalog());
      const respond = anthropicResponder({ apiKey, apiModelId: model.apiModelId });

      const report = await runSuite(dataset, respond);
      // eslint-disable-next-line no-console -- the printed score is the output of this job
      console.info(`[evals] model ${model.id}\n${formatReport(report)}`);
      expect(report.met, formatReport(report)).toBe(true);
    },
    SUITE_TIMEOUT_MS,
  );
});
