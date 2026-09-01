import { beforeAll, describe, expect, it } from 'vitest';

import {
  FAST_PARSE_COST_PROFILE,
  MAX_TAIL_COST_GROWTH,
  MIN_FULL_REPARSE_GROWTH,
  measureStreamingParseCost,
  parseCostGrowth,
  type ParseCostGrowth,
  type ParseCostReport,
} from './streamingParseCost';

const MEASUREMENT_TIMEOUT_MS = 120_000;

describe('streaming markdown parse cost', () => {
  let report: ParseCostReport;
  let growth: ParseCostGrowth;

  beforeAll(() => {
    report = measureStreamingParseCost(FAST_PARSE_COST_PROFILE);
    growth = parseCostGrowth(report);
  }, MEASUREMENT_TIMEOUT_MS);

  it('keeps the per-flush split cost flat as the message grows', () => {
    expect(growth.tail).toBeLessThanOrEqual(MAX_TAIL_COST_GROWTH);
  });

  it('measures a full reparse whose cost does track the whole message', () => {
    expect(growth.fullReparse).toBeGreaterThanOrEqual(MIN_FULL_REPARSE_GROWTH);
  });

  it('leaves the tail bounded at every measured size', () => {
    const largest = report.rows[report.rows.length - 1];
    const reference = report.rows.find((entry) => entry.size === report.referenceSize);
    expect(largest?.tailMedianChars ?? Number.NaN).toBeLessThanOrEqual(
      (reference?.tailMedianChars ?? 0) * MAX_TAIL_COST_GROWTH,
    );
  });

  it('collects the planned sample count at every size', () => {
    for (const entry of report.rows) {
      expect(entry.samples).toBe(
        FAST_PARSE_COST_PROFILE.samplesPerSize * FAST_PARSE_COST_PROFILE.iterations,
      );
    }
  });
});
