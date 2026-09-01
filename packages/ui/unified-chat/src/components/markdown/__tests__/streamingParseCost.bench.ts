import { beforeAll, describe, expect, it } from 'vitest';

import {
  FULL_PARSE_COST_PROFILE,
  MAX_TAIL_COST_GROWTH,
  MIN_FULL_REPARSE_GROWTH,
  formatParseCostTable,
  measureStreamingParseCost,
  parseCostGrowth,
  type ParseCostGrowth,
  type ParseCostReport,
} from './streamingParseCost';

const MEASUREMENT_TIMEOUT_MS = 900_000;

describe('streaming markdown parse cost at message sizes a long answer reaches', () => {
  let report: ParseCostReport;
  let growth: ParseCostGrowth;

  beforeAll(() => {
    report = measureStreamingParseCost(FULL_PARSE_COST_PROFILE);
    growth = parseCostGrowth(report);
    console.debug(formatParseCostTable(report));
  }, MEASUREMENT_TIMEOUT_MS);

  it('keeps the per-flush split cost flat as the message grows', () => {
    expect(growth.tail).toBeLessThanOrEqual(MAX_TAIL_COST_GROWTH);
  });

  it('measures a full reparse whose cost does track the whole message', () => {
    expect(growth.fullReparse).toBeGreaterThanOrEqual(MIN_FULL_REPARSE_GROWTH);
  });
});
