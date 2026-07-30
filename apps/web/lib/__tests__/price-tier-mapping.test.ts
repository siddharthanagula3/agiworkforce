import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('price tier mapping', () => {
  afterEach(() => {
    delete process.env['STRIPE_PRICE_PRO_MONTHLY'];
    delete process.env['STRIPE_PRICE_MAX_15X_MONTHLY'];
    delete process.env['PRICE_ID_OVERRIDES'];
    vi.resetModules();
  });

  it('maps and validates the Max 15x Stripe price as the canonical tier', async () => {
    process.env['STRIPE_PRICE_MAX_15X_MONTHLY'] = 'price_max_15x_monthly';
    const { getPlanTierFromPriceId, isValidPlanTier } = await import('../price-tier-mapping');

    expect(getPlanTierFromPriceId('price_max_15x_monthly')).toBe('max_15x');
    expect(isValidPlanTier('max_15x')).toBe(true);
  });

  it('treats the registered Stripe Price as authoritative over stale metadata', async () => {
    process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_monthly';
    const { resolvePlanTier } = await import('../price-tier-mapping');

    expect(resolvePlanTier({ plan_tier: 'max_15x' }, 'price_pro_monthly')).toBe('pro');
  });

  it('does not grant a paid tier from metadata when the Stripe Price is unknown', async () => {
    process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_monthly';
    const { resolvePlanTier } = await import('../price-tier-mapping');

    expect(resolvePlanTier({ plan_tier: 'pro' }, 'price_unregistered')).toBeNull();
    expect(resolvePlanTier({ plan_tier: 'pro' }, null)).toBeNull();
  });

  it('rejects a generic Stripe override for sales-assisted Team', async () => {
    process.env['PRICE_ID_OVERRIDES'] = 'price_team_override,team,monthly';
    const { getPlanTierFromPriceId } = await import('../price-tier-mapping');

    expect(getPlanTierFromPriceId('price_team_override')).toBeNull();
  });
});
