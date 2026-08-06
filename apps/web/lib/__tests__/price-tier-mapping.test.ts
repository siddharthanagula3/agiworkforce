import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('price tier mapping', () => {
  afterEach(() => {
    delete process.env['STRIPE_PRICE_PRO_MONTHLY'];
    delete process.env['STRIPE_PRICE_MAX_15X_MONTHLY'];
    delete process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'];
    delete process.env['STRIPE_PRICE_TEAM_MONTHLY_INR'];
    delete process.env['STRIPE_PRICE_TEAM_YEARLY_USD'];
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

  it('rejects a generic Stripe override for Team even though Team is self-serve', async () => {
    // Team carries org-admin capability. Its entitlement must only ever come
    // from a Price the deployment explicitly configured, never from a free-form
    // override string where a typo becomes a free team_admin grant.
    process.env['PRICE_ID_OVERRIDES'] = 'price_team_override,team,monthly';
    const { getPlanTierFromPriceId } = await import('../price-tier-mapping');

    expect(getPlanTierFromPriceId('price_team_override')).toBeNull();
  });

  it('registers both configured Team Prices so the webhook can provision a purchase', async () => {
    // Without registration the webhook throws "Cannot provision subscription
    // from an unregistered Stripe Price" AFTER the card is charged: money taken,
    // entitlement never granted, Stripe retrying forever.
    process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'] = 'price_team_usd';
    process.env['STRIPE_PRICE_TEAM_MONTHLY_INR'] = 'price_team_inr';
    const { getPlanTierFromPriceId, isPriceIdRegistered, getBillingDetailsFromPriceId } =
      await import('../price-tier-mapping');

    expect(isPriceIdRegistered('price_team_usd')).toBe(true);
    expect(isPriceIdRegistered('price_team_inr')).toBe(true);
    expect(getPlanTierFromPriceId('price_team_usd')).toBe('team');
    expect(getPlanTierFromPriceId('price_team_inr')).toBe('team');
    expect(getBillingDetailsFromPriceId('price_team_usd')).toMatchObject({
      tier: 'team',
      interval: 'monthly',
    });
  });

  it('leaves Team unregistered when no Team Price is configured', async () => {
    const { isPriceIdRegistered } = await import('../price-tier-mapping');
    expect(isPriceIdRegistered('price_team_usd')).toBe(false);
  });

  it('registers the Team yearly Price at the yearly interval so the webhook can provision it', async () => {
    // Decision #22: Team is sold yearly at $240/seat. The yearly Price must be
    // registered just like the monthly ones, or a yearly Team purchase charges
    // the card and then fails to provision on the unregistered-Price guard.
    process.env['STRIPE_PRICE_TEAM_MONTHLY_USD'] = 'price_team_usd';
    process.env['STRIPE_PRICE_TEAM_YEARLY_USD'] = 'price_team_yearly_usd';
    const { getPlanTierFromPriceId, isPriceIdRegistered, getBillingDetailsFromPriceId } =
      await import('../price-tier-mapping');

    expect(isPriceIdRegistered('price_team_yearly_usd')).toBe(true);
    expect(getPlanTierFromPriceId('price_team_yearly_usd')).toBe('team');
    expect(getBillingDetailsFromPriceId('price_team_yearly_usd')).toMatchObject({
      tier: 'team',
      interval: 'yearly',
    });
  });
});
