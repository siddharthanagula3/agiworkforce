import { describe, it, expect } from 'vitest';

import {
  effectiveInputPrice,
  effectiveOutputPrice,
  ESTIMATE_INFLATION,
  isDeprecated,
  isPromoExpired,
  tokenizerDriftFactor,
} from '../pricing';

// DeepSeek V4-Pro promo reverts to post_promo_prices at 2026-05-31T15:59:00Z.
const BEFORE_PROMO = new Date('2026-05-30T00:00:00Z');
const AFTER_PROMO = new Date('2026-06-01T00:00:00Z');
// grok-4 carries deprecation_date 2026-06-30.
const BEFORE_GROK_SUNSET = new Date('2026-06-29T00:00:00Z');
const AFTER_GROK_SUNSET = new Date('2026-07-01T00:00:00Z');

describe('tokenizerDriftFactor + ESTIMATE_INFLATION', () => {
  it('returns 1 + drift factor for drifted models (Opus 4.8: 0.35)', () => {
    expect(tokenizerDriftFactor('claude-opus-4.8')).toBeCloseTo(1.35, 5);
    expect(ESTIMATE_INFLATION.conservative('claude-opus-4.8')).toBeCloseTo(1.35, 5);
  });
  it('returns 1.0 for models without a drift factor and for unknown ids', () => {
    expect(tokenizerDriftFactor('claude-sonnet-4.6')).toBe(1.0);
    expect(tokenizerDriftFactor('made-up-model')).toBe(1.0);
  });
});

describe('isDeprecated', () => {
  it('returns false for stable models and true for unknown ids', () => {
    expect(isDeprecated('deepseek-v4-pro', AFTER_PROMO)).toBe(false);
    expect(isDeprecated('claude-opus-4.8', AFTER_PROMO)).toBe(false);
    // Missing entries are treated as deprecated (fail-safe against ghost ids).
    expect(isDeprecated('made-up-model', AFTER_PROMO)).toBe(true);
  });
  it('flips to true once past a model deprecation_date (grok-4: 2026-06-30)', () => {
    expect(isDeprecated('grok-4', BEFORE_GROK_SUNSET)).toBe(false);
    expect(isDeprecated('grok-4', AFTER_GROK_SUNSET)).toBe(true);
  });
});

describe('isPromoExpired + effective prices', () => {
  it('deepseek-v4-pro: promo active before cutoff, expired after', () => {
    expect(isPromoExpired('deepseek-v4-pro', BEFORE_PROMO)).toBe(false);
    expect(isPromoExpired('deepseek-v4-pro', AFTER_PROMO)).toBe(true);
    expect(isPromoExpired('claude-sonnet-4.6', AFTER_PROMO)).toBe(false); // no promo field
  });
  it('effective prices switch to post_promo_prices once the promo expires', () => {
    expect(effectiveInputPrice('deepseek-v4-pro', BEFORE_PROMO)).toBe(0.14);
    expect(effectiveOutputPrice('deepseek-v4-pro', BEFORE_PROMO)).toBe(0.28);
    expect(effectiveInputPrice('deepseek-v4-pro', AFTER_PROMO)).toBe(1.74);
    expect(effectiveOutputPrice('deepseek-v4-pro', AFTER_PROMO)).toBe(3.48);
  });
  it('non-promo models return their standard catalog price; unknown ids return 0', () => {
    expect(effectiveInputPrice('claude-sonnet-4.6', AFTER_PROMO)).toBe(3);
    expect(effectiveOutputPrice('claude-sonnet-4.6', AFTER_PROMO)).toBe(15);
    expect(effectiveInputPrice('made-up-model', AFTER_PROMO)).toBe(0);
  });
});
