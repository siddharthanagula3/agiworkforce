import { describe, it, expect } from 'vitest';

import realCatalog from '@agiworkforce/types/models.json';

import {
  effectiveInputPrice,
  effectiveModelPricing,
  effectiveOutputPrice,
  ESTIMATE_INFLATION,
  isDeprecated,
  isPromoExpired,
  tokenizerDriftFactor,
  type Catalog,
} from '../pricing';

// ============================================================================
// Logic tests — run against a SYNTHETIC fixture catalog, never the live data.
// ----------------------------------------------------------------------------
// The pricing helpers are injectable (optional trailing `catalog` arg) so the
// *logic* (drift = 1 + factor, promo flips at the cutoff, effective price
// switches to post_promo, deprecation boundary, missing-id fail-safe) is
// verified against controlled values. Asserting the real catalog's own numbers
// would be circular — it can only lock a value in, never catch a wrong one,
// and would break on every weekly sync. Real-catalog *invariants* are tested
// separately below.
// ============================================================================

const FIXTURE: Catalog = {
  models: {
    // Drifted model: tokenizer_drift_factor 0.35 → inflation 1.35.
    'fx-drift': {
      id: 'fx-drift',
      provider: 'fixture',
      inputCost: 10,
      outputCost: 20,
      tokenizer_drift_factor: 0.35,
    },
    // Flat model: no drift, no promo, no deprecation.
    'fx-flat': {
      id: 'fx-flat',
      provider: 'fixture',
      inputCost: 3,
      outputCost: 15,
    },
    // Promo model: discounted now (0.5 / 1), reverts to 2 / 4 after the cutoff.
    'fx-promo': {
      id: 'fx-promo',
      provider: 'fixture',
      inputCost: 0.5,
      outputCost: 1,
      promo_expires_at: '2026-06-01T00:00:00Z',
      post_promo_prices: { input: 2, output: 4 },
    },
    // Ordered tiers deliberately coexist with a promo so both composition and
    // greatest-qualifying-threshold behavior are observable.
    'fx-long': {
      id: 'fx-long',
      provider: 'fixture',
      inputCost: 1,
      outputCost: 4,
      cached_input: 0.1,
      cached_write: 1.25,
      promo_expires_at: '2026-06-01T00:00:00Z',
      post_promo_prices: { input: 3, output: 9, cached_input: 0.3, cached_write: 3.75 },
      inputTokenPricingTiers: [
        {
          thresholdTokens: 10,
          inputCost: 20,
          outputCost: 60,
          cached_input: 2,
          cached_write: 25,
        },
        {
          thresholdTokens: 20,
          inputCost: 30,
          outputCost: 90,
          cached_input: 3,
          cached_write: 37.5,
        },
      ],
    },
    // Dated-deprecation model: sunsets 2026-06-15.
    'fx-sunset': {
      id: 'fx-sunset',
      provider: 'fixture',
      inputCost: 1,
      outputCost: 2,
      deprecation_date: '2026-06-15T00:00:00Z',
    },
  },
};

const BEFORE = new Date('2026-05-30T00:00:00Z');
const AFTER = new Date('2026-06-10T00:00:00Z'); // past promo cutoff, before sunset
const AFTER_SUNSET = new Date('2026-06-20T00:00:00Z');

describe('tokenizerDriftFactor + ESTIMATE_INFLATION (logic)', () => {
  it('returns 1 + drift factor for drifted models', () => {
    expect(tokenizerDriftFactor('fx-drift', FIXTURE)).toBeCloseTo(1.35, 5);
    expect(ESTIMATE_INFLATION.conservative('fx-drift', FIXTURE)).toBeCloseTo(1.35, 5);
  });
  it('returns 1.0 for models without a drift factor and for unknown ids', () => {
    expect(tokenizerDriftFactor('fx-flat', FIXTURE)).toBe(1.0);
    expect(tokenizerDriftFactor('does-not-exist', FIXTURE)).toBe(1.0);
  });
});

describe('isDeprecated (logic)', () => {
  it('returns false for models with no deprecation date', () => {
    expect(isDeprecated('fx-flat', AFTER_SUNSET, FIXTURE)).toBe(false);
  });
  it('treats unknown ids as deprecated (fail-safe against ghost ids)', () => {
    expect(isDeprecated('does-not-exist', BEFORE, FIXTURE)).toBe(true);
  });
  it('flips to true once past a model deprecation_date', () => {
    expect(isDeprecated('fx-sunset', BEFORE, FIXTURE)).toBe(false);
    expect(isDeprecated('fx-sunset', AFTER_SUNSET, FIXTURE)).toBe(true);
  });
});

describe('isPromoExpired + effective prices (logic)', () => {
  it('promo active before the cutoff, expired at/after it', () => {
    expect(isPromoExpired('fx-promo', BEFORE, FIXTURE)).toBe(false);
    expect(isPromoExpired('fx-promo', AFTER, FIXTURE)).toBe(true);
    expect(isPromoExpired('fx-flat', AFTER, FIXTURE)).toBe(false); // no promo field
  });
  it('effective prices switch to post_promo_prices once the promo expires', () => {
    expect(effectiveInputPrice('fx-promo', BEFORE, FIXTURE)).toBe(0.5);
    expect(effectiveOutputPrice('fx-promo', BEFORE, FIXTURE)).toBe(1);
    expect(effectiveInputPrice('fx-promo', AFTER, FIXTURE)).toBe(2);
    expect(effectiveOutputPrice('fx-promo', AFTER, FIXTURE)).toBe(4);
  });
  it('non-promo models return their flat price; unknown ids return 0', () => {
    expect(effectiveInputPrice('fx-flat', AFTER, FIXTURE)).toBe(3);
    expect(effectiveOutputPrice('fx-flat', AFTER, FIXTURE)).toBe(15);
    expect(effectiveInputPrice('does-not-exist', AFTER, FIXTURE)).toBe(0);
  });
});

describe('effectiveModelPricing input-length composition', () => {
  it('uses the dated/promo base at a threshold and the greatest tier above it', () => {
    expect(effectiveModelPricing('fx-long', 10, AFTER, FIXTURE)).toEqual({
      inputCost: 3,
      outputCost: 9,
      cached_input: 0.3,
      cached_write: 3.75,
      cached_write_1h: undefined,
    });
    expect(effectiveModelPricing('fx-long', 11, AFTER, FIXTURE)).toEqual({
      inputCost: 20,
      outputCost: 60,
      cached_input: 2,
      cached_write: 25,
      cached_write_1h: undefined,
    });
    expect(effectiveModelPricing('fx-long', 20, AFTER, FIXTURE)).toEqual({
      inputCost: 20,
      outputCost: 60,
      cached_input: 2,
      cached_write: 25,
      cached_write_1h: undefined,
    });
    expect(effectiveModelPricing('fx-long', 21, AFTER, FIXTURE)).toEqual({
      inputCost: 30,
      outputCost: 90,
      cached_input: 3,
      cached_write: 37.5,
      cached_write_1h: undefined,
    });
  });
});

// ============================================================================
// Invariant tests — run against the REAL catalog. These assert STRUCTURAL
// properties that must hold regardless of the (sync-updated) numbers, so they
// catch malformed data without locking in magic values.
// ============================================================================

interface RealModel {
  inputCost?: number;
  outputCost?: number;
  cached_input?: number;
  promo_expires_at?: string | null;
  post_promo_prices?: { input: number; output: number; cached_input?: number };
  deprecation_date?: string | null;
  tokenizer_drift_factor?: number;
}

const realModels = (realCatalog as unknown as { models: Record<string, RealModel> }).models;
const realEntries = Object.entries(realModels);

describe('real catalog invariants', () => {
  it('has a non-empty model map', () => {
    expect(realEntries.length).toBeGreaterThan(0);
  });

  it('never carries negative prices', () => {
    for (const [id, m] of realEntries) {
      for (const field of ['inputCost', 'outputCost', 'cached_input'] as const) {
        const v = m[field];
        if (v != null) {
          expect(Number.isFinite(v), `${id}.${field} must be finite`).toBe(true);
          expect(v, `${id}.${field} must be >= 0`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('any model with a promo cutoff has a parseable date AND post_promo_prices', () => {
    for (const [id, m] of realEntries) {
      if (m.promo_expires_at == null) continue;
      expect(
        Number.isNaN(Date.parse(m.promo_expires_at)),
        `${id}.promo_expires_at must parse`,
      ).toBe(false);
      expect(
        m.post_promo_prices,
        `${id} has a promo cutoff but no post_promo_prices`,
      ).toBeDefined();
      expect(Number.isFinite(m.post_promo_prices?.input)).toBe(true);
      expect(Number.isFinite(m.post_promo_prices?.output)).toBe(true);
    }
  });

  it('any deprecation_date is a parseable timestamp', () => {
    for (const [id, m] of realEntries) {
      if (m.deprecation_date == null) continue;
      expect(
        Number.isNaN(Date.parse(m.deprecation_date)),
        `${id}.deprecation_date must parse`,
      ).toBe(false);
    }
  });

  it('any tokenizer_drift_factor is a finite, non-negative number', () => {
    for (const [id, m] of realEntries) {
      if (m.tokenizer_drift_factor == null) continue;
      expect(Number.isFinite(m.tokenizer_drift_factor), `${id} drift factor finite`).toBe(true);
      expect(m.tokenizer_drift_factor, `${id} drift factor >= 0`).toBeGreaterThanOrEqual(0);
    }
  });

  it('exported helpers run against the real catalog without throwing and return finite numbers', () => {
    const [sampleId] = realEntries[0];
    expect(typeof isDeprecated(sampleId)).toBe('boolean');
    expect(typeof isPromoExpired(sampleId)).toBe('boolean');
    expect(Number.isFinite(effectiveInputPrice(sampleId))).toBe(true);
    expect(Number.isFinite(effectiveOutputPrice(sampleId))).toBe(true);
    expect(Number.isFinite(tokenizerDriftFactor(sampleId))).toBe(true);
  });
});
