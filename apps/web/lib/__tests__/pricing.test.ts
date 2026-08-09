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
  it('includes both Max usage tiers at the top level', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS).toHaveProperty('pro');
    expect(STRIPE_PRICE_IDS).toHaveProperty('max');
    expect(STRIPE_PRICE_IDS).toHaveProperty('max_15x');
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
    expect(STRIPE_PRICE_IDS.max_15x.yearly).toBeUndefined();
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
      STRIPE_PRICE_MAX_15X_MONTHLY: 'price_max_15x_monthly_abc',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_pro_monthly_abc')).toBe('pro');
    expect(PRICING_CONFIG.getPlanFromPriceId('price_max_monthly_abc')).toBe('max');
    expect(PRICING_CONFIG.getPlanFromPriceId('price_max_15x_monthly_abc')).toBe('max_15x');
  });
});

describe('PRICING_CONFIG.plans', () => {
  it('has plan entries for Pro and both Max capacities', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const ids = PRICING_CONFIG.plans.map((p) => p.id);
    expect(ids).toContain('pro');
    expect(ids).toContain('max');
    expect(ids).toContain('max_15x');
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
    expect(max).not.toHaveProperty('waitlist', true);
  });

  it('carries Team in the configured checkout catalog as a per-seat plan', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const team = PRICING_CONFIG.plans.find((plan) => plan.id === 'team');
    expect(team).toBeDefined();
    // Marked per-seat so no price renderer can mistake the unit amount for the
    // whole organization's monthly bill. $25/seat per founder decision
    // 2026-08-05 (Decision #22).
    expect(team).toHaveProperty('perSeat', true);
    expect(team?.price.monthly).toBe(25);
    // Yearly is now published from the canonical catalog at $240/seat/yr
    // (Decision #22). Live checkout still fails closed until the Stripe Price
    // behind STRIPE_PRICE_TEAM_YEARLY_USD exists.
    expect(team?.price.yearly).toBe(240);
  });

  it('resolves both Team currency Prices back to the team tier', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_TEAM_MONTHLY_USD: 'price_team_usd',
      STRIPE_PRICE_TEAM_MONTHLY_INR: 'price_team_inr',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_team_usd')).toBe('team');
    expect(PRICING_CONFIG.getPlanFromPriceId('price_team_inr')).toBe('team');
  });

  it('selects the Team Price by billing currency and interval', async () => {
    const { getConfiguredPriceId, PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_TEAM_MONTHLY_USD: 'price_team_usd',
      STRIPE_PRICE_TEAM_MONTHLY_INR: 'price_team_inr',
      STRIPE_PRICE_TEAM_YEARLY_USD: 'price_team_yearly_usd',
    });
    expect(getConfiguredPriceId('team', 'monthly', 'usd')).toBe('price_team_usd');
    expect(getConfiguredPriceId('team', 'monthly', 'INR')).toBe('price_team_inr');
    expect(getConfiguredPriceId('team', 'monthly')).toBe('price_team_usd');
    // Team yearly is wired (USD $240/seat/yr, Decision #22). A yearly lookup
    // must resolve to the dedicated yearly Price, never reuse the monthly one.
    expect(getConfiguredPriceId('team', 'yearly', 'usd')).toBe('price_team_yearly_usd');
    // No INR yearly Price exists (founder-undecided); an INR yearly request
    // falls back to the USD yearly Price, mirroring monthlyInr -> monthlyUsd.
    expect(getConfiguredPriceId('team', 'yearly', 'inr')).toBe('price_team_yearly_usd');
    expect(getConfiguredPriceId('team', 'yearly')).toBe('price_team_yearly_usd');
    expect(PRICING_CONFIG.getPlanFromPriceId('price_team_yearly_usd')).toBe('team');
  });

  it('offers no Team yearly Price when STRIPE_PRICE_TEAM_YEARLY_USD is unset (fail-closed)', async () => {
    const { getConfiguredPriceId } = await importPricingWithEnv({
      STRIPE_PRICE_TEAM_MONTHLY_USD: 'price_team_usd',
      STRIPE_PRICE_TEAM_YEARLY_USD: undefined,
    });
    // Monthly still resolves; yearly refuses so an unconfigured deployment
    // cannot start Team yearly checkout.
    expect(getConfiguredPriceId('team', 'monthly', 'usd')).toBe('price_team_usd');
    expect(getConfiguredPriceId('team', 'yearly', 'usd')).toBeUndefined();
    expect(getConfiguredPriceId('team', 'yearly', 'inr')).toBeUndefined();
  });

  it('falls back to the USD Team Price when no INR Price is configured', async () => {
    const { getConfiguredPriceId } = await importPricingWithEnv({
      STRIPE_PRICE_TEAM_MONTHLY_USD: 'price_team_usd',
      STRIPE_PRICE_TEAM_MONTHLY_INR: undefined,
    });
    expect(getConfiguredPriceId('team', 'monthly', 'inr')).toBe('price_team_usd');
  });

  it('resolves no Team Price at all when the env vars are unset', async () => {
    const { getConfiguredPriceId } = await importPricingWithEnv({
      STRIPE_PRICE_TEAM_MONTHLY_USD: undefined,
      STRIPE_PRICE_TEAM_MONTHLY_INR: undefined,
    });
    // Fails CLOSED: an unconfigured deployment cannot start Team checkout.
    expect(getConfiguredPriceId('team', 'monthly', 'usd')).toBeUndefined();
  });

  it('rejects a malformed Team price id instead of passing it to Stripe', async () => {
    const { getConfiguredPriceId } = await importPricingWithEnv({
      STRIPE_PRICE_TEAM_MONTHLY_USD: 'prod_not_a_price',
    });
    expect(getConfiguredPriceId('team', 'monthly', 'usd')).toBeUndefined();
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

describe('getConfiguredPriceId', () => {
  it('uses the canonical price owner for every checkout plan', async () => {
    const { getConfiguredPriceId } = await importPricingWithEnv({
      STRIPE_PRICE_BASIC_MONTHLY_USD: 'price_basic_usd',
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly',
      STRIPE_PRICE_PRO_YEARLY: 'price_pro_yearly',
      STRIPE_PRICE_MAX_MONTHLY: 'price_max_monthly',
      STRIPE_PRICE_MAX_15X_MONTHLY: 'price_max_15x_monthly',
    });

    expect(getConfiguredPriceId('basic', 'monthly')).toBe('price_basic_usd');
    expect(getConfiguredPriceId('pro', 'yearly')).toBe('price_pro_yearly');
    expect(getConfiguredPriceId('max', 'monthly')).toBe('price_max_monthly');
    expect(getConfiguredPriceId('max_15x', 'monthly')).toBe('price_max_15x_monthly');
    expect(getConfiguredPriceId('max', 'yearly')).toBeUndefined();
  });
});
