import { describe, it, expect } from 'vitest';

import realCatalog from '@agiworkforce/types/models.json';

import { effectiveModelPricing, tokenizerDriftFactor, type Catalog } from '../pricing';

const FIXTURE: Catalog = {
  models: {
    'fx-drift': {
      id: 'fx-drift',
      provider: 'fixture',
      inputCost: 10,
      outputCost: 20,
      tokenizer_drift_factor: 0.35,
    },
    'fx-flat': {
      id: 'fx-flat',
      provider: 'fixture',
      inputCost: 3,
      outputCost: 15,
    },
    'fx-promo': {
      id: 'fx-promo',
      provider: 'fixture',
      inputCost: 0.5,
      outputCost: 1,
      promo_expires_at: '2026-06-01T00:00:00Z',
      post_promo_prices: { input: 2, output: 4 },
    },
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
    'fx-sunset': {
      id: 'fx-sunset',
      provider: 'fixture',
      inputCost: 1,
      outputCost: 2,
      deprecation_date: '2026-06-15T00:00:00Z',
    },
  },
};

const AFTER = new Date('2026-06-10T00:00:00Z');

describe('tokenizerDriftFactor (logic)', () => {
  it('returns 1 + drift factor for drifted models', () => {
    expect(tokenizerDriftFactor('fx-drift', FIXTURE)).toBeCloseTo(1.35, 5);
  });
  it('returns 1.0 for models without a drift factor and for unknown ids', () => {
    expect(tokenizerDriftFactor('fx-flat', FIXTURE)).toBe(1.0);
    expect(tokenizerDriftFactor('does-not-exist', FIXTURE)).toBe(1.0);
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
    expect(Number.isFinite(tokenizerDriftFactor(sampleId))).toBe(true);
  });
});
