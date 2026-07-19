import { describe, expect, it } from 'vitest';

import { LLMCostCalculator } from '../llm-cost-calculator';

/** Regression coverage for the founder-selected Sonnet 5 standard rates. */

const PROMO_MODEL = 'claude-sonnet-5';
const STILL_PROMO = new Date('2026-08-30T23:59:59.999Z');
const AT_CUTOFF = new Date('2026-08-31T00:00:00.000Z');
const WELL_PAST_CUTOFF = new Date('2026-09-01T00:00:00.000Z');

describe('LLMCostCalculator — Sonnet 5 standard pricing', () => {
  it('uses standard rates for every field before the former promotion cutoff', () => {
    const pricing = LLMCostCalculator.getPricing('anthropic', PROMO_MODEL, STILL_PROMO);
    expect(pricing.inputCostPer1MTokens).toBe(3);
    expect(pricing.outputCostPer1MTokens).toBe(15);
    expect(pricing.cachedInputCostPer1MTokens).toBe(0.3);
    expect(pricing.cachedWriteCostPer1MTokens).toBe(3.75);
  });

  it('keeps standard rates at the former cutoff instant', () => {
    const pricing = LLMCostCalculator.getPricing('anthropic', PROMO_MODEL, AT_CUTOFF);
    expect(pricing.inputCostPer1MTokens).toBe(3);
    expect(pricing.outputCostPer1MTokens).toBe(15);
    expect(pricing.cachedInputCostPer1MTokens).toBe(0.3);
    expect(pricing.cachedWriteCostPer1MTokens).toBe(3.75);
  });

  it('keeps standard rates well past the former cutoff', () => {
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

    // Standard: (1M*$3) + (1M*$15) + (1M*$0.3) + (1M*$3.75) = $22.05.
    const preCents = LLMCostCalculator.calculateCost('anthropic', PROMO_MODEL, usage, STILL_PROMO);
    expect(preCents).toBe(2205);

    // Date never changes the founder-selected standard price.
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

    expect(LLMCostCalculator.calculateCost('anthropic', PROMO_MODEL, usage, STILL_PROMO)).toBe(600);
    expect(LLMCostCalculator.calculateCost('anthropic', PROMO_MODEL, usage, WELL_PAST_CUTOFF)).toBe(
      600,
    );
  });

  it('estimateCost and getInputCostPerMtok use the same standard rate', () => {
    expect(LLMCostCalculator.getInputCostPerMtok('anthropic', PROMO_MODEL, STILL_PROMO)).toBe(3);
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
    expect(preEstimate).toBe(300);
    expect(postEstimate).toBe(300); // 1M * $3/M = 300 cents
  });

  it('does not apply date-dependent promotional pricing', () => {
    const before = LLMCostCalculator.getPricing('anthropic', PROMO_MODEL, STILL_PROMO);
    const after = LLMCostCalculator.getPricing('anthropic', PROMO_MODEL, WELL_PAST_CUTOFF);
    expect(after).toEqual(before);
  });

  it('preserves sub-cent precision for private free-plan settlement', () => {
    const usage = { promptTokens: 100, completionTokens: 0, totalTokens: 100 };

    expect(LLMCostCalculator.calculateCost('anthropic', PROMO_MODEL, usage, WELL_PAST_CUTOFF)).toBe(
      0,
    );
    expect(
      LLMCostCalculator.calculateCostMicrousd('anthropic', PROMO_MODEL, usage, WELL_PAST_CUTOFF),
    ).toBe(300);
  });
});
