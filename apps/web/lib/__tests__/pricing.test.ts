/**
 * Tests for lib/pricing.ts
 *
 * Covers:
 *   - STRIPE_PRICE_IDS includes a pro_plus key with monthly/annual slots
 *   - getPlanFromPriceId returns 'pro_plus' when a matching price ID is set
 *   - Missing pro_plus env vars don't crash; validatePriceId returns undefined gracefully
 *   - arePriceIdsConfigured includes pro_plus in its scan
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — set up before the module under test is imported
// ---------------------------------------------------------------------------

// Suppress logger side-effects in tests
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

/**
 * Re-import pricing.ts with a custom set of env vars.
 * Vitest module cache must be reset per test that needs different env state.
 */
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
  // Restore
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
  it('includes a pro_plus key at the top level', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS).toHaveProperty('pro_plus');
  });

  it('pro_plus has monthly and annual slots', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS.pro_plus).toHaveProperty('monthly');
    expect(STRIPE_PRICE_IDS.pro_plus).toHaveProperty('annual');
  });

  it('pro_plus.monthly is undefined when env var is not set', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_PLUS_MONTHLY: undefined,
      STRIPE_PRICE_PRO_PLUS_YEARLY: undefined,
    });
    expect(STRIPE_PRICE_IDS.pro_plus.monthly).toBeUndefined();
    expect(STRIPE_PRICE_IDS.pro_plus.annual).toBeUndefined();
  });

  it('pro_plus.monthly resolves to the env var value when it starts with price_', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_PLUS_MONTHLY: 'price_pro_plus_monthly_test',
      STRIPE_PRICE_PRO_PLUS_YEARLY: 'price_pro_plus_yearly_test',
    });
    expect(STRIPE_PRICE_IDS.pro_plus.monthly).toBe('price_pro_plus_monthly_test');
    expect(STRIPE_PRICE_IDS.pro_plus.annual).toBe('price_pro_plus_yearly_test');
  });

  it('pro_plus slots are undefined when env value does not start with price_', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_PLUS_MONTHLY: 'invalid_id',
      STRIPE_PRICE_PRO_PLUS_YEARLY: 'also_invalid',
    });
    expect(STRIPE_PRICE_IDS.pro_plus.monthly).toBeUndefined();
    expect(STRIPE_PRICE_IDS.pro_plus.annual).toBeUndefined();
  });
});

describe('getPlanFromPriceId — pro_plus', () => {
  it('returns "pro_plus" for a matching monthly price ID', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_PLUS_MONTHLY: 'price_pro_plus_monthly_abc',
      STRIPE_PRICE_PRO_PLUS_YEARLY: 'price_pro_plus_yearly_abc',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_pro_plus_monthly_abc')).toBe('pro_plus');
  });

  it('returns "pro_plus" for a matching annual price ID', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_PLUS_MONTHLY: 'price_pro_plus_monthly_abc',
      STRIPE_PRICE_PRO_PLUS_YEARLY: 'price_pro_plus_yearly_abc',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_pro_plus_yearly_abc')).toBe('pro_plus');
  });

  it('returns null for an unknown price ID (pro_plus not configured)', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_PLUS_MONTHLY: undefined,
      STRIPE_PRICE_PRO_PLUS_YEARLY: undefined,
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_unknown_xyz')).toBeNull();
  });

  it('does not return pro_plus when price ID matches a different plan', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_PRO_MONTHLY: 'price_pro_monthly_abc',
      STRIPE_PRICE_PRO_PLUS_MONTHLY: 'price_pro_plus_monthly_abc',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_pro_monthly_abc')).toBe('pro');
  });
});

describe('PRICING_CONFIG.plans includes pro_plus', () => {
  it('has a plan entry with id "pro_plus"', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const plan = PRICING_CONFIG.plans.find((p) => p.id === 'pro_plus');
    expect(plan).toBeDefined();
  });

  it('pro_plus plan is ordered between pro and max', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const ids = PRICING_CONFIG.plans.map((p) => p.id);
    const proIdx = ids.indexOf('pro');
    const proPlusIdx = ids.indexOf('pro_plus');
    const maxIdx = ids.indexOf('max');
    expect(proPlusIdx).toBeGreaterThan(proIdx);
    expect(proPlusIdx).toBeLessThan(maxIdx);
  });

  it('pro_plus plan has name "Pro+"', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const plan = PRICING_CONFIG.plans.find((p) => p.id === 'pro_plus');
    expect(plan?.name).toBe('Pro+');
  });

  it('pro_plus price.monthly is 49.99', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const plan = PRICING_CONFIG.plans.find((p) => p.id === 'pro_plus');
    expect(plan?.price.monthly).toBe(49.99);
  });

  it('pro_plus price.annual is 499.88', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const plan = PRICING_CONFIG.plans.find((p) => p.id === 'pro_plus');
    expect(plan?.price.annual).toBe(499.88);
  });
});

describe('arePriceIdsConfigured includes pro_plus', () => {
  it('returns true when only pro_plus monthly is configured', async () => {
    const { arePriceIdsConfigured } = await importPricingWithEnv({
      STRIPE_PRICE_HOBBY_MONTHLY: undefined,
      STRIPE_PRICE_HOBBY_YEARLY: undefined,
      STRIPE_PRICE_PRO_MONTHLY: undefined,
      STRIPE_PRICE_PRO_YEARLY: undefined,
      STRIPE_PRICE_PRO_PLUS_MONTHLY: 'price_pro_plus_monthly_only',
      STRIPE_PRICE_PRO_PLUS_YEARLY: undefined,
      STRIPE_PRICE_MAX_MONTHLY: undefined,
      STRIPE_PRICE_MAX_YEARLY: undefined,
    });
    expect(arePriceIdsConfigured()).toBe(true);
  });

  it('returns false when no env vars are set at all', async () => {
    const { arePriceIdsConfigured } = await importPricingWithEnv({
      STRIPE_PRICE_HOBBY_MONTHLY: undefined,
      STRIPE_PRICE_HOBBY_YEARLY: undefined,
      STRIPE_PRICE_PRO_MONTHLY: undefined,
      STRIPE_PRICE_PRO_YEARLY: undefined,
      STRIPE_PRICE_PRO_PLUS_MONTHLY: undefined,
      STRIPE_PRICE_PRO_PLUS_YEARLY: undefined,
      STRIPE_PRICE_MAX_MONTHLY: undefined,
      STRIPE_PRICE_MAX_YEARLY: undefined,
    });
    expect(arePriceIdsConfigured()).toBe(false);
  });
});
