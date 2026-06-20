/**
 * Tests for lib/pricing.ts
 *
 * Covers:
 *   - STRIPE_PRICE_IDS includes pro and max keys (hobby removed)
 *   - getPlanFromPriceId returns the correct plan when a matching price ID is set
 *   - Missing env vars don't crash; validatePriceId returns undefined gracefully
 *   - arePriceIdsConfigured works with the current 2-plan structure
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks · set up before the module under test is imported
// ---------------------------------------------------------------------------

vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function importPricingWithEnv(
  overrides: Record<string, string | undefined> = {},
): Promise<typeof import('../pricing')> {
  vi.resetModules();
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  const mod = await import('../pricing');
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  return mod;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('STRIPE_PRICE_IDS structure', () => {
  it('includes pro and max keys at the top level', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS).toHaveProperty('pro');
    expect(STRIPE_PRICE_IDS).toHaveProperty('max');
  });

  it('does not include hobby or pro_plus keys', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS).not.toHaveProperty('hobby');
    expect(STRIPE_PRICE_IDS).not.toHaveProperty('pro_plus');
  });

  it('pro has monthly and yearly slots', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS.pro).toHaveProperty('monthly');
    expect(STRIPE_PRICE_IDS.pro).toHaveProperty('yearly');
  });

  it('pro.monthly is undefined when env var is not set', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: undefined,
      STRIPE_PRICE_PRO_YEARLY: undefined,
    });
    expect(STRIPE_PRICE_IDS.pro.monthly).toBeUndefined();
    expect(STRIPE_PRICE_IDS.pro.yearly).toBeUndefined();
  });

  it('pro.monthly resolves to the env var value when it starts with price_', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly_test',
      STRIPE_PRICE_PRO_YEARLY: 'price_pro_yearly_test',
    });
    expect(STRIPE_PRICE_IDS.pro.monthly).toBe('price_pro_monthly_test');
    expect(STRIPE_PRICE_IDS.pro.yearly).toBe('price_pro_yearly_test');
  });

  it('pro slots are undefined when env value does not start with price_', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: 'invalid_id',
      STRIPE_PRICE_PRO_YEARLY: 'also_invalid',
    });
    expect(STRIPE_PRICE_IDS.pro.monthly).toBeUndefined();
    expect(STRIPE_PRICE_IDS.pro.yearly).toBeUndefined();
  });

  it('max.yearly is always undefined (monthly-only plan)', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS.max.yearly).toBeUndefined();
  });
});

describe('getPlanFromPriceId', () => {
  it('returns "pro" for a matching monthly price ID', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly_abc',
      STRIPE_PRICE_PRO_YEARLY: 'price_pro_yearly_abc',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_pro_monthly_abc')).toBe('pro');
  });

  it('returns "pro" for a matching yearly price ID', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly_abc',
      STRIPE_PRICE_PRO_YEARLY: 'price_pro_yearly_abc',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_pro_yearly_abc')).toBe('pro');
  });

  it('returns null for an unknown price ID', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: undefined,
      STRIPE_PRICE_PRO_YEARLY: undefined,
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_unknown_xyz')).toBeNull();
  });

  it('does not confuse pro and max price IDs', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly_abc',
      STRIPE_PRICE_MAX_MONTHLY: 'price_max_monthly_abc',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_pro_monthly_abc')).toBe('pro');
    expect(PRICING_CONFIG.getPlanFromPriceId('price_max_monthly_abc')).toBe('max');
  });
});

describe('PRICING_CONFIG.plans', () => {
  it('has plan entries for pro and max', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const ids = PRICING_CONFIG.plans.map((p) => p.id);
    expect(ids).toContain('pro');
    expect(ids).toContain('max');
  });

  it('does not have hobby or pro_plus plan entries', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const ids = PRICING_CONFIG.plans.map((p) => p.id);
    expect(ids).not.toContain('hobby');
    expect(ids).not.toContain('pro_plus');
  });

  it('max plan is not waitlisted (enabled for checkout)', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const max = PRICING_CONFIG.plans.find((p) => p.id === 'max');
    expect(max?.waitlist).toBeFalsy();
  });

  it('plans are ordered pro, max', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const ids = PRICING_CONFIG.plans.map((p) => p.id);
    const proIdx = ids.indexOf('pro');
    const maxIdx = ids.indexOf('max');
    expect(proIdx).toBeLessThan(maxIdx);
  });
});

describe('arePriceIdsConfigured', () => {
  it('returns true when pro monthly is configured', async () => {
    const { arePriceIdsConfigured } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly_only',
      STRIPE_PRICE_PRO_YEARLY: undefined,
      STRIPE_PRICE_MAX_MONTHLY: undefined,
    });
    expect(arePriceIdsConfigured()).toBe(true);
  });

  it('returns false when no env vars are set at all', async () => {
    const { arePriceIdsConfigured } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: undefined,
      STRIPE_PRICE_PRO_YEARLY: undefined,
      STRIPE_PRICE_MAX_MONTHLY: undefined,
    });
    expect(arePriceIdsConfigured()).toBe(false);
  });
});
