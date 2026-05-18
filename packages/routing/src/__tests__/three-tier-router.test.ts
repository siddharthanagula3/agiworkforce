/**
 * Tests for `three-tier-router.ts` — promo-expiry + deprecation auto-reroute.
 *
 * Coverage targets:
 *   §1 deprecation check (kimi-k2.6 stable / dropped families auto-fallback)
 *   §2 promo-expiry check around the 2026-05-31T15:59:00Z DeepSeek V4-Pro cliff
 *   §3 effective pricing flips at the promo boundary
 *   §4 tokenizer drift inflation factor for Claude Opus 4.7
 *   §5 resolveThreeTierModel — primary / post-promo / deprecation / emergency lanes
 *   §6 quality-sensitive override → claude-sonnet-4.6 for reasoning/long_context/computer-use
 */

import { describe, it, expect } from 'vitest';

import {
  effectiveInputPrice,
  effectiveOutputPrice,
  ESTIMATE_INFLATION,
  isDeprecated,
  isPromoExpired,
  resolveThreeTierModel,
  tokenizerDriftFactor,
} from '../three-tier-router';

// Pinned moments for deterministic time-travel tests.
const BEFORE_PROMO = new Date('2026-05-15T00:00:00Z');
const AT_PROMO_CUTOFF = new Date('2026-05-31T15:59:00Z');
const AFTER_PROMO = new Date('2026-06-01T00:00:00Z');
const BEFORE_KIMI_DEATH = new Date('2026-05-20T00:00:00Z');
const AFTER_KIMI_DEATH = new Date('2026-05-26T00:00:00Z'); // The K2-* aliases die 2026-05-25; kimi-k2.6 itself has deprecation_date: null.

// ============================================================================
// §1 Deprecation check
// ============================================================================

describe('isDeprecated', () => {
  it('returns false for stable models (deprecation_date: null)', () => {
    expect(isDeprecated('kimi-k2.6', BEFORE_KIMI_DEATH)).toBe(false);
    expect(isDeprecated('kimi-k2.6', AFTER_KIMI_DEATH)).toBe(false);
    expect(isDeprecated('deepseek-v4-flash', AFTER_PROMO)).toBe(false);
    expect(isDeprecated('claude-opus-4.7', AFTER_PROMO)).toBe(false);
  });

  it('returns true for models flagged deprecated past their sunset date', () => {
    // sora-2 has an explicit 2026-09-24 deprecation per OpenAI announcement.
    expect(isDeprecated('sora-2', new Date('2026-09-23T00:00:00Z'))).toBe(false);
    expect(isDeprecated('sora-2', new Date('2026-09-25T00:00:00Z'))).toBe(true);
  });

  it('treats missing catalog entries as deprecated', () => {
    expect(isDeprecated('kimi-k2.5', AFTER_KIMI_DEATH)).toBe(true);
    expect(isDeprecated('deepseek-chat', AFTER_PROMO)).toBe(true);
    expect(isDeprecated('deepseek-reasoner', AFTER_PROMO)).toBe(true);
  });
});

// ============================================================================
// §2 Promo-expiry check
// ============================================================================

describe('isPromoExpired', () => {
  it('returns false for deepseek-v4-pro before the 2026-05-31T15:59:00Z cutoff', () => {
    expect(isPromoExpired('deepseek-v4-pro', BEFORE_PROMO)).toBe(false);
  });

  it('returns true for deepseek-v4-pro at and after the cutoff', () => {
    expect(isPromoExpired('deepseek-v4-pro', AT_PROMO_CUTOFF)).toBe(true);
    expect(isPromoExpired('deepseek-v4-pro', AFTER_PROMO)).toBe(true);
  });

  it('returns false for models without a promo (stable pricing)', () => {
    expect(isPromoExpired('deepseek-v4-flash', AFTER_PROMO)).toBe(false);
    expect(isPromoExpired('claude-opus-4.7', AFTER_PROMO)).toBe(false);
    expect(isPromoExpired('kimi-k2.6', AFTER_PROMO)).toBe(false);
  });
});

// ============================================================================
// §3 Effective pricing
// ============================================================================

describe('effective pricing', () => {
  it('serves promo prices for deepseek-v4-pro pre-cutoff', () => {
    expect(effectiveInputPrice('deepseek-v4-pro', BEFORE_PROMO)).toBe(0.14);
    expect(effectiveOutputPrice('deepseek-v4-pro', BEFORE_PROMO)).toBe(0.28);
  });

  it('flips to post-promo prices for deepseek-v4-pro post-cutoff', () => {
    expect(effectiveInputPrice('deepseek-v4-pro', AFTER_PROMO)).toBe(1.74);
    expect(effectiveOutputPrice('deepseek-v4-pro', AFTER_PROMO)).toBe(3.48);
  });

  it('keeps deepseek-v4-flash pricing stable (no promo on file)', () => {
    expect(effectiveInputPrice('deepseek-v4-flash', BEFORE_PROMO)).toBe(0.14);
    expect(effectiveInputPrice('deepseek-v4-flash', AFTER_PROMO)).toBe(0.14);
    expect(effectiveOutputPrice('deepseek-v4-flash', AFTER_PROMO)).toBe(0.28);
  });

  it('returns the pinned kimi-k2.6 price (0.60 / 2.50) after the K2 family dies', () => {
    expect(effectiveInputPrice('kimi-k2.6', AFTER_KIMI_DEATH)).toBe(0.6);
    expect(effectiveOutputPrice('kimi-k2.6', AFTER_KIMI_DEATH)).toBe(2.5);
  });
});

// ============================================================================
// §4 Tokenizer drift inflation
// ============================================================================

describe('tokenizer drift', () => {
  it('returns 1.35 for claude-opus-4.7 (0.35 drift factor)', () => {
    expect(tokenizerDriftFactor('claude-opus-4.7')).toBeCloseTo(1.35, 5);
    expect(ESTIMATE_INFLATION.conservative('claude-opus-4.7')).toBeCloseTo(1.35, 5);
  });

  it('returns 1.0 (identity) for non-drifted models', () => {
    expect(tokenizerDriftFactor('claude-sonnet-4.6')).toBe(1.0);
    expect(tokenizerDriftFactor('gpt-5.4')).toBe(1.0);
    expect(tokenizerDriftFactor('deepseek-v4-flash')).toBe(1.0);
  });

  it('returns 1.0 for unknown models (graceful fallback)', () => {
    expect(tokenizerDriftFactor('made-up-model')).toBe(1.0);
  });
});

// ============================================================================
// §5 resolveThreeTierModel — primary / fallback lanes
// ============================================================================

describe('resolveThreeTierModel — primary lane', () => {
  it('returns deepseek-v4-pro for balanced coding pre-promo', () => {
    const r = resolveThreeTierModel('coding', 'balanced', BEFORE_PROMO);
    expect(r.modelId).toBe('deepseek-v4-pro');
    expect(r.fallbackReason).toBe('primary');
    expect(r.qualitySensitive).toBe(false);
  });

  it('returns claude-opus-4.7 for premium reasoning pre-promo', () => {
    const r = resolveThreeTierModel('reasoning', 'premium', BEFORE_PROMO);
    expect(r.modelId).toBe('claude-opus-4.7');
    expect(r.fallbackReason).toBe('primary');
    expect(r.qualitySensitive).toBe(true);
  });

  it('returns gemini-3.1-flash-lite for economy simple_chat', () => {
    const r = resolveThreeTierModel('simple_chat', 'economy', BEFORE_PROMO);
    expect(r.modelId).toBe('gemini-3.1-flash-lite');
    expect(r.fallbackReason).toBe('primary');
  });
});

describe('resolveThreeTierModel — post-promo fallback', () => {
  it('reroutes balanced coding from deepseek-v4-pro → deepseek-v4-flash after promo', () => {
    const r = resolveThreeTierModel('coding', 'balanced', AFTER_PROMO);
    expect(r.modelId).toBe('deepseek-v4-flash');
    expect(r.fallbackReason).toBe('post-promo-fallback');
  });

  it('reroutes balanced reasoning to claude-sonnet-4.6 after promo (quality-sensitive)', () => {
    const r = resolveThreeTierModel('reasoning', 'balanced', AFTER_PROMO);
    expect(r.modelId).toBe('claude-sonnet-4.6');
    expect(r.fallbackReason).toBe('post-promo-fallback');
    expect(r.qualitySensitive).toBe(true);
  });

  it('reroutes premium coding from deepseek-v4-pro → claude-sonnet-4.6 after promo (premium path)', () => {
    const r = resolveThreeTierModel('coding', 'premium', AFTER_PROMO);
    // Premium coding's postPromoFallback is 'claude-sonnet-4.6'.
    expect(r.modelId).toBe('claude-sonnet-4.6');
    expect(r.fallbackReason).toBe('post-promo-fallback');
  });

  it('reroutes long_context fallback to claude-sonnet-4.6 (quality-sensitive override)', () => {
    // Even though `balanced.long_context.primary === 'claude-sonnet-4.6'` already,
    // if we force a reroute (test premium with a promo-eligible primary),
    // we want sonnet, not the cheaper sibling.
    const r = resolveThreeTierModel('long_context', 'balanced', AFTER_PROMO);
    expect(r.modelId).toBe('claude-sonnet-4.6');
    expect(r.qualitySensitive).toBe(true);
  });
});

describe('resolveThreeTierModel — deprecation fallback', () => {
  it('does NOT trigger deprecation fallback for kimi-k2.6 (deprecation_date: null)', () => {
    // Even after the wider K2 family dies on 2026-05-25, kimi-k2.6 itself
    // stays alive. (No policy table currently routes to a K2 primary, but
    // verifying the guard is correct against the stable model.)
    expect(isDeprecated('kimi-k2.6', AFTER_KIMI_DEATH)).toBe(false);
  });

  it('treats deepseek-chat / deepseek-reasoner / kimi-k2.5* as deprecated (entries dropped)', () => {
    expect(isDeprecated('deepseek-chat', BEFORE_PROMO)).toBe(true);
    expect(isDeprecated('deepseek-reasoner', BEFORE_PROMO)).toBe(true);
    expect(isDeprecated('kimi-k2.5', BEFORE_PROMO)).toBe(true);
    expect(isDeprecated('kimi-k2.5-thinking', BEFORE_PROMO)).toBe(true);
    expect(isDeprecated('kimi-k2.5-turbo', BEFORE_PROMO)).toBe(true);
  });
});

describe('resolveThreeTierModel — quality-sensitive override', () => {
  it.each(['reasoning', 'long_context', 'computer-use'] as const)(
    'overrides post-promo fallback to claude-sonnet-4.6 for task=%s',
    (taskType) => {
      const r = resolveThreeTierModel(taskType, 'balanced', AFTER_PROMO);
      // For balanced tier × these task types, the primary is either claude-sonnet-4.6
      // already OR a model that triggers fallback (deepseek-v4-pro for reasoning).
      // When fallback fires, the override kicks in.
      if (r.fallbackReason !== 'primary') {
        expect(r.modelId).toBe('claude-sonnet-4.6');
      }
      expect(r.qualitySensitive).toBe(true);
    },
  );

  it('returns primary for non-quality-sensitive tasks (no override needed)', () => {
    const r = resolveThreeTierModel('simple_chat', 'balanced', AFTER_PROMO);
    expect(r.qualitySensitive).toBe(false);
    // simple_chat primary is gpt-5.4-mini, no promo, so still primary.
    expect(r.fallbackReason).toBe('primary');
  });
});

// ============================================================================
// §6 Boundary edges
// ============================================================================

describe('promo boundary edges', () => {
  it('treats the exact cutoff timestamp as expired (>=, not >)', () => {
    expect(isPromoExpired('deepseek-v4-pro', AT_PROMO_CUTOFF)).toBe(true);
  });

  it('routes correctly at the cutoff timestamp', () => {
    const r = resolveThreeTierModel('coding', 'balanced', AT_PROMO_CUTOFF);
    expect(r.modelId).toBe('deepseek-v4-flash');
    expect(r.fallbackReason).toBe('post-promo-fallback');
  });
});
