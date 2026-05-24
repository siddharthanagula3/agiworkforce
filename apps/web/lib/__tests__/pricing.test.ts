/**
 * Tests for lib/pricing.ts
 *
 * Covers:
 *   - STRIPE_PRICE_IDS includes hobby, pro, max keys (pro_plus removed)
 *   - getPlanFromPriceId returns the correct plan when a matching price ID is set
 *   - Missing env vars don't crash; validatePriceId returns undefined gracefully
 *   - arePriceIdsConfigured works with the current 3-plan structure
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
  it('includes hobby, pro, and max keys at the top level', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS).toHaveProperty('hobby');
    expect(STRIPE_PRICE_IDS).toHaveProperty('pro');
    expect(STRIPE_PRICE_IDS).toHaveProperty('max');
  });

  it('does not include pro_plus key (removed in Fix 7)', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS).not.toHaveProperty('pro_plus');
  });

  it('hobby has monthly and yearly slots', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv();
    expect(STRIPE_PRICE_IDS.hobby).toHaveProperty('monthly');
    expect(STRIPE_PRICE_IDS.hobby).toHaveProperty('yearly');
  });

  it('hobby.monthly is undefined when env var is not set', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv({
      STRIPE_PRICE_HOBBY_MONTHLY: undefined,
      STRIPE_PRICE_HOBBY_YEARLY: undefined,
    });
    expect(STRIPE_PRICE_IDS.hobby.monthly).toBeUndefined();
    expect(STRIPE_PRICE_IDS.hobby.yearly).toBeUndefined();
  });

  it('hobby.monthly resolves to the env var value when it starts with price_', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv({
      STRIPE_PRICE_HOBBY_MONTHLY: 'price_hobby_monthly_test',
      STRIPE_PRICE_HOBBY_YEARLY: 'price_hobby_yearly_test',
    });
    expect(STRIPE_PRICE_IDS.hobby.monthly).toBe('price_hobby_monthly_test');
    expect(STRIPE_PRICE_IDS.hobby.yearly).toBe('price_hobby_yearly_test');
  });

  it('hobby slots are undefined when env value does not start with price_', async () => {
    const { STRIPE_PRICE_IDS } = await importPricingWithEnv({
      STRIPE_PRICE_HOBBY_MONTHLY: 'invalid_id',
      STRIPE_PRICE_HOBBY_YEARLY: 'also_invalid',
    });
    expect(STRIPE_PRICE_IDS.hobby.monthly).toBeUndefined();
    expect(STRIPE_PRICE_IDS.hobby.yearly).toBeUndefined();
  });
});

describe('getPlanFromPriceId', () => {
  it('returns "hobby" for a matching monthly price ID', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv({
      STRIPE_PRICE_HOBBY_MONTHLY: 'price_hobby_monthly_abc',
      STRIPE_PRICE_HOBBY_YEARLY: 'price_hobby_yearly_abc',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId('price_hobby_monthly_abc')).toBe('hobby');
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
      STRIPE_PRICE_HOBBY_MONTHLY: undefined,
      STRIPE_PRICE_HOBBY_YEARLY: undefined,
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
  it('has plan entries for hobby, pro, and max', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const ids = PRICING_CONFIG.plans.map((p) => p.id);
    expect(ids).toContain('hobby');
    expect(ids).toContain('pro');
    expect(ids).toContain('max');
  });

  it('does not have a pro_plus plan entry (removed in Fix 7)', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const ids = PRICING_CONFIG.plans.map((p) => p.id);
    expect(ids).not.toContain('pro_plus');
  });

  it('plans are ordered hobby, pro, max', async () => {
    const { PRICING_CONFIG } = await importPricingWithEnv();
    const ids = PRICING_CONFIG.plans.map((p) => p.id);
    const hobbyIdx = ids.indexOf('hobby');
    const proIdx = ids.indexOf('pro');
    const maxIdx = ids.indexOf('max');
    expect(hobbyIdx).toBeLessThan(proIdx);
    expect(proIdx).toBeLessThan(maxIdx);
  });
});

describe('arePriceIdsConfigured', () => {
  it('returns true when hobby monthly is configured', async () => {
    const { arePriceIdsConfigured } = await importPricingWithEnv({
      STRIPE_PRICE_HOBBY_MONTHLY: 'price_hobby_monthly_only',
      STRIPE_PRICE_HOBBY_YEARLY: undefined,
      STRIPE_PRICE_PRO_MONTHLY: undefined,
      STRIPE_PRICE_PRO_YEARLY: undefined,
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
      STRIPE_PRICE_MAX_MONTHLY: undefined,
      STRIPE_PRICE_MAX_YEARLY: undefined,
    });
    expect(arePriceIdsConfigured()).toBe(false);
  });
});
