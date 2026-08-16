import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('price tier mapping', () => {
  const priceEnvVars = [
    'STRIPE_PRICE_BASIC_MONTHLY_USD',
    'STRIPE_PRICE_BASIC_MONTHLY_INR',
    'STRIPE_PRICE_PRO_MONTHLY',
    'STRIPE_PRICE_PRO_YEARLY',
    'STRIPE_PRICE_MAX_MONTHLY',
    'STRIPE_PRICE_MAX_15X_MONTHLY',
    'STRIPE_PRICE_TEAM_MONTHLY_USD',
    'STRIPE_PRICE_TEAM_MONTHLY_INR',
    'STRIPE_PRICE_TEAM_YEARLY_USD',
    'STRIPE_PRICE_ENTERPRISE_MONTHLY',
    'STRIPE_PRICE_ENTERPRISE_YEARLY',
    'PRICE_ID_OVERRIDES',
  ] as const;

  beforeEach(() => {
    for (const envVar of priceEnvVars) delete process.env[envVar];
    vi.resetModules();
  });

  afterEach(() => {
    for (const envVar of priceEnvVars) delete process.env[envVar];
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

  it('preserves Stripe Price case, trims whitespace, and rejects a case-variant entitlement', async () => {
    process.env['STRIPE_PRICE_PRO_MONTHLY'] = '  price_LiveAbC123  ';
    const { getAllRegisteredPriceIds, isPriceIdRegistered, resolvePlanTier } =
      await import('../price-tier-mapping');

    expect(getAllRegisteredPriceIds()).toContain('price_LiveAbC123');
    expect(resolvePlanTier(null, 'price_LiveAbC123')).toBe('pro');
    expect(resolvePlanTier(null, '  price_LiveAbC123  ')).toBe('pro');
    expect(resolvePlanTier({ plan_tier: 'pro' }, 'price_liveabc123')).toBeNull();
    expect(isPriceIdRegistered('price_liveabc123')).toBe(false);
  });

  it('keeps override Price IDs case-sensitive too', async () => {
    process.env['PRICE_ID_OVERRIDES'] = ' price_OverrideAbC , pro , yearly ';
    const { getPlanTierFromPriceId, getTierMapping } = await import('../price-tier-mapping');

    expect(getPlanTierFromPriceId('price_OverrideAbC')).toBe('pro');
    expect(getPlanTierFromPriceId('price_overrideabc')).toBeNull();
    expect(getTierMapping()['price_OverrideAbC']).toEqual({ tier: 'pro', interval: 'yearly' });
  });

  it('does not report drift when configured mixed-case Price IDs differ only by whitespace', async () => {
    process.env['STRIPE_PRICE_PRO_MONTHLY'] = '  price_LiveAbC123  ';
    const { validatePriceIdConsistency } = await import('../validate-env');

    expect(validatePriceIdConsistency()).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('rejects a generic Stripe override for Team even though Team is self-serve', async () => {
    process.env['PRICE_ID_OVERRIDES'] = 'price_team_override,team,monthly';
    const { getPlanTierFromPriceId } = await import('../price-tier-mapping');

    expect(getPlanTierFromPriceId('price_team_override')).toBeNull();
  });

  it('registers both configured Team Prices so the webhook can provision a purchase', async () => {
    process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'] = 'price_team_usd';
    process.env['STRIPE_PRICE_TEAM_MONTHLY_INR'] = 'price_team_inr';
    const { getPlanTierFromPriceId, isPriceIdRegistered, getTierMapping } =
      await import('../price-tier-mapping');

    expect(isPriceIdRegistered('price_team_usd')).toBe(true);
    expect(isPriceIdRegistered('price_team_inr')).toBe(true);
    expect(getPlanTierFromPriceId('price_team_usd')).toBe('team');
    expect(getPlanTierFromPriceId('price_team_inr')).toBe('team');
    expect(getTierMapping()['price_team_usd']).toEqual({
      tier: 'team',
      interval: 'monthly',
    });
  });

  it('leaves Team unregistered when no Team Price is configured', async () => {
    const { isPriceIdRegistered } = await import('../price-tier-mapping');
    expect(isPriceIdRegistered('price_team_usd')).toBe(false);
  });

  it('registers the Team yearly Price at the yearly interval so the webhook can provision it', async () => {
    process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'] = 'price_team_usd';
    process.env['STRIPE_PRICE_TEAM_YEARLY_USD'] = 'price_team_yearly_usd';
    const { getPlanTierFromPriceId, isPriceIdRegistered, getTierMapping } =
      await import('../price-tier-mapping');

    expect(isPriceIdRegistered('price_team_yearly_usd')).toBe(true);
    expect(getPlanTierFromPriceId('price_team_yearly_usd')).toBe('team');
    expect(getTierMapping()['price_team_yearly_usd']).toEqual({
      tier: 'team',
      interval: 'yearly',
    });
  });
});
