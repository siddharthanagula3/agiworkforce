import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeInputTokenPricingTiers,
  normalizeLongContextPricing,
  normalizePricingSchedule,
} from '../scripts/compile.mjs';

/**
 * Compiler-side coverage for the dated-pricing MECHANISM.
 *
 * Every fixture here is synthetic: a made-up model key with arbitrary window
 * dates. That is deliberate. Proving the mechanism against a live promotional
 * window would tie these assertions to a shipped price, so retiring that price
 * would look like a mechanism regression (and, worse, restoring the price would
 * look like a way to make the tests pass). What the shipped roster publishes is
 * asserted separately in `current-roster.test.mjs` and `catalog-policy.test.mjs`.
 *
 * `effectiveFrom`/`effectiveUntil` are UTC calendar days, inclusive on both
 * sides; a changeover happens at UTC midnight.
 */

const MODEL = 'fixture-model';

test('normalizes ordered input-length tiers into explicit registry rate names', () => {
  assert.deepEqual(
    normalizeInputTokenPricingTiers(MODEL, [
      {
        thresholdTokens: 10,
        inputCost: 2,
        outputCost: 6,
        cached_input: 0.2,
        cached_write: 2.5,
      },
      {
        thresholdTokens: 20,
        inputCost: 3,
        outputCost: 9,
        cached_input: 0.3,
        cached_write: 3.75,
        cached_write_1h: 6,
      },
    ]),
    [
      {
        thresholdTokens: 10,
        inputPerMillion: 2,
        outputPerMillion: 6,
        cacheReadPerMillion: 0.2,
        cacheWritePerMillion: 2.5,
      },
      {
        thresholdTokens: 20,
        inputPerMillion: 3,
        outputPerMillion: 9,
        cacheReadPerMillion: 0.3,
        cacheWritePerMillion: 3.75,
        cacheWrite1hPerMillion: 6,
      },
    ],
  );
});

test('rejects unusable or silently lossy input-length tiers', () => {
  assert.throws(
    () =>
      normalizeInputTokenPricingTiers(MODEL, [{ thresholdTokens: 0, inputCost: 2, outputCost: 6 }]),
    /thresholdTokens must be a positive integer/u,
  );
  assert.throws(
    () =>
      normalizeInputTokenPricingTiers(MODEL, [
        {
          thresholdTokens: 10,
          inputCost: 2,
          outputCost: 6,
          inventedRate: 1,
        },
      ]),
    /has unsupported keys: inventedRate/u,
  );
  assert.throws(() => normalizeInputTokenPricingTiers(MODEL, []), /must be a non-empty array/u);
  assert.throws(
    () =>
      normalizeInputTokenPricingTiers(MODEL, [
        { thresholdTokens: 20, inputCost: 3, outputCost: 9 },
        { thresholdTokens: 10, inputCost: 2, outputCost: 6 },
      ]),
    /thresholds must be strictly increasing/u,
  );
});

test('normalizes the legacy singleton only for read compatibility', () => {
  assert.deepEqual(
    normalizeLongContextPricing(MODEL, {
      thresholdTokens: 10,
      inputCost: 2,
      outputCost: 6,
    }),
    { thresholdTokens: 10, inputPerMillion: 2, outputPerMillion: 6 },
  );
});

test('normalizes a dated window into registry pricing fields', () => {
  const schedule = normalizePricingSchedule(MODEL, [
    {
      effectiveUntil: '2030-03-31',
      note: 'Synthetic first window.',
      inputCost: 1,
      outputCost: 2,
      cached_input: 0.1,
      cached_write: 1.25,
      cached_write_1h: 2,
    },
    { effectiveFrom: '2030-04-01', inputCost: 4 },
  ]);

  assert.deepEqual(schedule, [
    {
      effectiveUntil: '2030-03-31',
      note: 'Synthetic first window.',
      inputPerMillion: 1,
      outputPerMillion: 2,
      cacheReadPerMillion: 0.1,
      cacheWritePerMillion: 1.25,
      cacheWrite1hPerMillion: 2,
    },
    { effectiveFrom: '2030-04-01', inputPerMillion: 4 },
  ]);
});

test('leaves a model with no schedule untouched', () => {
  assert.equal(normalizePricingSchedule(MODEL, undefined), undefined);
});

test('rejects a schedule that is present but empty', () => {
  assert.throws(() => normalizePricingSchedule(MODEL, []), /must be a non-empty array/u);
});

test('rejects a window with neither bound', () => {
  assert.throws(
    () => normalizePricingSchedule(MODEL, [{ inputCost: 1 }]),
    /must declare effectiveFrom, effectiveUntil, or both/u,
  );
});

test('rejects a bound that is not a YYYY-MM-DD calendar day', () => {
  assert.throws(
    () => normalizePricingSchedule(MODEL, [{ effectiveFrom: '2030-04-01T00:00:00Z' }]),
    /must be a YYYY-MM-DD date/u,
  );
});

test('rejects a window that ends before it starts', () => {
  assert.throws(
    () =>
      normalizePricingSchedule(MODEL, [
        { effectiveFrom: '2030-04-01', effectiveUntil: '2030-03-31' },
      ]),
    /effectiveFrom must not be after effectiveUntil/u,
  );
});

test('rejects an unsupported key instead of silently dropping it', () => {
  assert.throws(
    () => normalizePricingSchedule(MODEL, [{ effectiveFrom: '2030-04-01', batchInputCost: 0.5 }]),
    /has unsupported keys: batchInputCost/u,
  );
});

// Overlap rejection. Consumers resolve a date by taking the FIRST covering
// window, so two windows covering the same day would make the billed price
// depend on authoring order — a silent, order-dependent price.
test('rejects overlapping windows with closed ranges', () => {
  assert.throws(
    () =>
      normalizePricingSchedule(MODEL, [
        { effectiveFrom: '2030-01-01', effectiveUntil: '2030-06-30', inputCost: 1 },
        { effectiveFrom: '2030-06-01', effectiveUntil: '2030-12-31', inputCost: 2 },
      ]),
    /pricingSchedule windows must not overlap/u,
  );
});

test('rejects windows that overlap on a single shared day (inclusive bounds)', () => {
  assert.throws(
    () =>
      normalizePricingSchedule(MODEL, [
        { effectiveFrom: '2030-01-01', effectiveUntil: '2030-06-30', inputCost: 1 },
        { effectiveFrom: '2030-06-30', effectiveUntil: '2030-12-31', inputCost: 2 },
      ]),
    /pricingSchedule windows must not overlap/u,
  );
});

test('rejects an open-ended window that swallows a later one', () => {
  // Missing bounds are open-ended, so an open-left window intersects anything
  // before its end and an open-right window intersects anything after its start.
  assert.throws(
    () =>
      normalizePricingSchedule(MODEL, [
        { effectiveFrom: '2030-01-01', inputCost: 1 },
        { effectiveFrom: '2031-01-01', effectiveUntil: '2031-12-31', inputCost: 2 },
      ]),
    /pricingSchedule windows must not overlap/u,
  );
  assert.throws(
    () =>
      normalizePricingSchedule(MODEL, [
        { effectiveUntil: '2030-12-31', inputCost: 1 },
        { effectiveFrom: '2030-01-01', effectiveUntil: '2030-06-30', inputCost: 2 },
      ]),
    /pricingSchedule windows must not overlap/u,
  );
});

test('names both offending windows and the model in the overlap error', () => {
  assert.throws(
    () =>
      normalizePricingSchedule('overlapping-model', [
        { effectiveUntil: '2030-06-30', inputCost: 1 },
        { effectiveFrom: '2030-06-01', inputCost: 2 },
      ]),
    (error) => {
      assert.match(error.message, /overlapping-model pricingSchedule windows must not overlap/u);
      assert.match(error.message, /\[0\] \(open\)\.\.2030-06-30/u);
      assert.match(error.message, /\[1\] 2030-06-01\.\.\(open\)/u);
      return true;
    },
  );
});

test('accepts adjacent windows that meet without overlapping', () => {
  // The common shape: one window ends on a UTC day and the next starts on the
  // following UTC day, so exactly one window covers every date.
  const schedule = normalizePricingSchedule(MODEL, [
    { effectiveUntil: '2030-03-31', inputCost: 1 },
    { effectiveFrom: '2030-04-01', effectiveUntil: '2030-06-30', inputCost: 2 },
    { effectiveFrom: '2030-07-01', inputCost: 3 },
  ]);
  assert.equal(schedule.length, 3);
  assert.deepEqual(
    schedule.map((window) => window.inputPerMillion),
    [1, 2, 3],
  );
});

test('accepts a gap between windows — uncovered dates fall back to the base price', () => {
  const schedule = normalizePricingSchedule(MODEL, [
    { effectiveUntil: '2030-03-31', inputCost: 1 },
    { effectiveFrom: '2031-01-01', inputCost: 3 },
  ]);
  assert.equal(schedule.length, 2);
});
