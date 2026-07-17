import { describe, expect, it } from 'vitest';

import { LLMCostCalculator } from '../llm-cost-calculator';

/**
 * Regression coverage for Sonnet 5's promotional pricing boundary
 * (`promo_expires_at: '2026-08-31'` in packages/contracts/types/src/models.json).
 * Pinned dates straddle the exact cutoff instant (`isPromoExpired` treats
 * `now >= cutoff` as expired, so 2026-08-31T00:00:00.000Z itself is already
 * post-promo, not the last promo day).
 */

const PROMO_MODEL = 'claude-sonnet-5';
const STILL_PROMO = new Date('2026-08-30T23:59:59.999Z');
const AT_CUTOFF = new Date('2026-08-31T00:00:00.000Z');
const WELL_PAST_CUTOFF = new Date('2026-09-01T00:00:00.000Z');

describe('LLMCostCalculator — post_promo_prices date-aware pricing', () => {
  it('uses promo rates for every field (input/output/cached) before the cutoff', () => {
    const pricing = LLMCostCalculator.getPricing('anthropic', PROMO_MODEL, STILL_PROMO);
    expect(pricing.inputCostPer1MTokens).toBe(2);
    expect(pricing.outputCostPer1MTokens).toBe(10);
    expect(pricing.cachedInputCostPer1MTokens).toBe(0.2);
    expect(pricing.cachedWriteCostPer1MTokens).toBe(2.5);
  });

  it('switches to post_promo rates for every field at the exact cutoff instant', () => {
    const pricing = LLMCostCalculator.getPricing('anthropic', PROMO_MODEL, AT_CUTOFF);
    expect(pricing.inputCostPer1MTokens).toBe(3);
    expect(pricing.outputCostPer1MTokens).toBe(15);
    expect(pricing.cachedInputCostPer1MTokens).toBe(0.3);
    expect(pricing.cachedWriteCostPer1MTokens).toBe(3.75);
  });

  it('stays on post_promo rates well past the cutoff', () => {
    const pricing = LLMCostCalculator.getPricing('anthropic', PROMO_MODEL, WELL_PAST_CUTOFF);
    expect(pricing.inputCostPer1MTokens).toBe(3);
    expect(pricing.outputCostPer1MTokens).toBe(15);
  });

  it('bills a mixed input/output/cache-read/cache-write request correctly on both sides of the boundary', () => {
    const usage = {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    };

    // Pre-promo: (1M*$2) input + (1M*$10) output + (1M*$0.2) cache-read +
    // (1M*$2.5) cache-write(5m) = $14.70 -> 1470 cents.
    const preCents = LLMCostCalculator.calculateCost('anthropic', PROMO_MODEL, usage, STILL_PROMO);
    expect(preCents).toBe(1470);

    // Post-promo: (1M*$3) + (1M*$15) + (1M*$0.3) + (1M*$3.75) = $22.05 ->
    // 2205 cents. A fix that only swaps input/output and leaves
    // cached_input/cached_write on the promo rate would land here at 2120
    // cents instead (undercharging cache by $0.85) -- this assertion is the
    // one that catches that half-fixed version.
    const postCents = LLMCostCalculator.calculateCost(
      'anthropic',
      PROMO_MODEL,
      usage,
      WELL_PAST_CUTOFF,
    );
    expect(postCents).toBe(2205);
  });

  it('derives the 1h cache-write rate as 2x the effective (date-aware) input rate', () => {
    const usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheCreationInputTokens: 1_000_000,
      cacheCreation1hInputTokens: 1_000_000,
    };

    // Pre-promo: 1h rate = 2 * $2 = $4/M -> 400 cents (matches models.json's
    // cached_write_1h: 4 for the promo period).
    expect(LLMCostCalculator.calculateCost('anthropic', PROMO_MODEL, usage, STILL_PROMO)).toBe(400);
    // Post-promo: 1h rate = 2 * $3 = $6/M -> 600 cents (matches
    // post_promo_prices.cached_write_1h: 6).
    expect(LLMCostCalculator.calculateCost('anthropic', PROMO_MODEL, usage, WELL_PAST_CUTOFF)).toBe(
      600,
    );
  });

  it('estimateCost and getInputCostPerMtok honor the same date-aware switch', () => {
    expect(LLMCostCalculator.getInputCostPerMtok('anthropic', PROMO_MODEL, STILL_PROMO)).toBe(2);
    expect(LLMCostCalculator.getInputCostPerMtok('anthropic', PROMO_MODEL, WELL_PAST_CUTOFF)).toBe(
      3,
    );

    const preEstimate = LLMCostCalculator.estimateCost(
      'anthropic',
      PROMO_MODEL,
      1_000_000,
      0,
      STILL_PROMO,
    );
    const postEstimate = LLMCostCalculator.estimateCost(
      'anthropic',
      PROMO_MODEL,
      1_000_000,
      0,
      WELL_PAST_CUTOFF,
    );
    expect(preEstimate).toBe(200); // 1M * $2/M = 200 cents
    expect(postEstimate).toBe(300); // 1M * $3/M = 300 cents
  });

  it('leaves a model with no promo_expires_at unaffected by the date parameter', () => {
    // claude-sonnet-4.6 has no promo_expires_at/post_promo_prices in the
    // catalog -- getPricing must return the same rates regardless of `now`.
    const before = LLMCostCalculator.getPricing('anthropic', 'claude-sonnet-4.6', STILL_PROMO);
    const after = LLMCostCalculator.getPricing('anthropic', 'claude-sonnet-4.6', WELL_PAST_CUTOFF);
    expect(after).toEqual(before);
  });
});
