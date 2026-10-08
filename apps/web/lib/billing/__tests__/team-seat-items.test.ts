import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const STANDARD = 'price_team_standard';
const STANDARD_INR = 'price_team_standard_inr';
const STANDARD_YEARLY = 'price_team_standard_yearly';
const PREMIUM = 'price_team_premium';
const PREMIUM_YEARLY = 'price_team_premium_yearly';
const PRO = 'price_pro_monthly';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', PRO);
  vi.stubEnv('STRIPE_PRICE_TEAM_MONTHLY_USD', STANDARD);
  vi.stubEnv('STRIPE_PRICE_TEAM_MONTHLY_INR', STANDARD_INR);
  vi.stubEnv('STRIPE_PRICE_TEAM_YEARLY_USD', STANDARD_YEARLY);
  vi.stubEnv('STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD', PREMIUM);
  vi.stubEnv('STRIPE_PRICE_TEAM_PREMIUM_YEARLY_USD', PREMIUM_YEARLY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Premium seat Stripe prices', () => {
  it('registers both Premium prices on the Team tier, so a Premium line never changes the subscription tier', async () => {
    const { getPlanTierFromPriceId, getTierMapping, isPriceIdRegistered } =
      await import('@/lib/price-tier-mapping');

    expect(isPriceIdRegistered(PREMIUM)).toBe(true);
    expect(getPlanTierFromPriceId(PREMIUM)).toBe('team');
    expect(getPlanTierFromPriceId(PREMIUM_YEARLY)).toBe('team');
    expect(getTierMapping()[PREMIUM]).toEqual({ tier: 'team', interval: 'monthly' });
    expect(getTierMapping()[PREMIUM_YEARLY]).toEqual({ tier: 'team', interval: 'yearly' });
  });

  it('tells a Premium seat price from a Standard one, and knows no seat type on other plans', async () => {
    const { seatTypeOfLineItem } = await import('../team-seat-items');

    expect(seatTypeOfLineItem({ price: { id: PREMIUM } })).toBe('premium');
    expect(seatTypeOfLineItem({ price: PREMIUM_YEARLY })).toBe('premium');
    expect(seatTypeOfLineItem({ price: { id: STANDARD } })).toBe('standard');
    expect(seatTypeOfLineItem({ price: { id: STANDARD_INR } })).toBe('standard');
    expect(seatTypeOfLineItem({ price: { id: STANDARD_YEARLY } })).toBe('standard');
    expect(seatTypeOfLineItem({ price: { id: PRO } })).toBeNull();
    expect(seatTypeOfLineItem({ price: { id: 'price_unknown' } })).toBeNull();
    expect(seatTypeOfLineItem({ price: null })).toBeNull();
    expect(seatTypeOfLineItem({})).toBeNull();
  });

  it('cannot be minted through the generic price override', async () => {
    vi.stubEnv('PRICE_ID_OVERRIDES', 'price_sneaky,team_premium,monthly');
    const { isPriceIdRegistered } = await import('@/lib/price-tier-mapping');

    expect(isPriceIdRegistered('price_sneaky')).toBe(false);
  });

  it('resolves the configured Premium price by interval and has none in rupees', async () => {
    const { getConfiguredPriceId, getPricePointForPriceId, PRICING_CONFIG } =
      await import('@/lib/pricing');

    expect(getConfiguredPriceId('team_premium', 'monthly', 'usd')).toBe(PREMIUM);
    expect(getConfiguredPriceId('team_premium', 'yearly', 'usd')).toBe(PREMIUM_YEARLY);
    expect(getConfiguredPriceId('team_premium', 'monthly', 'inr')).toBe(PREMIUM);
    expect(getPricePointForPriceId(PREMIUM)).toMatchObject({
      plan: 'team_premium',
      interval: 'monthly',
      currency: 'usd',
    });
    expect(PRICING_CONFIG.getPlanFromPriceId(PREMIUM)).toBe('team');
  });

  it('leaves Premium seats closed when no Premium price is configured', async () => {
    vi.stubEnv('STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD', '');
    vi.stubEnv('STRIPE_PRICE_TEAM_PREMIUM_YEARLY_USD', '');
    const { getConfiguredPriceId } = await import('@/lib/pricing');
    const { isPriceIdRegistered } = await import('@/lib/price-tier-mapping');

    expect(getConfiguredPriceId('team_premium', 'monthly', 'usd')).toBeUndefined();
    expect(getConfiguredPriceId('team', 'monthly', 'usd')).toBe(STANDARD);
    expect(isPriceIdRegistered(PREMIUM)).toBe(false);
  });
});

describe('seat lines on a subscription', () => {
  it('reads how many seats of each type are billed', async () => {
    const { resolveSeatQuantities } = await import('../team-seat-items');

    expect(
      resolveSeatQuantities([
        { price: { id: PREMIUM }, quantity: 2 },
        { price: { id: STANDARD }, quantity: 5 },
      ]),
    ).toEqual({ standard: 5, premium: 2 });
    expect(resolveSeatQuantities([{ price: PREMIUM_YEARLY, quantity: 3 }])).toEqual({
      standard: 0,
      premium: 3,
    });
  });

  it('reads no seat types on a subscription that bills no Team seat price', async () => {
    const { resolveSeatQuantities } = await import('../team-seat-items');

    expect(resolveSeatQuantities([{ price: { id: PRO }, quantity: 1 }])).toBeNull();
    expect(resolveSeatQuantities([{ quantity: 12 }])).toBeNull();
    expect(resolveSeatQuantities([])).toBeNull();
    expect(resolveSeatQuantities(null)).toBeNull();
  });

  it('counts a missing, fractional or negative quantity as no seats', async () => {
    const { resolveSeatQuantities } = await import('../team-seat-items');

    expect(
      resolveSeatQuantities([
        { price: { id: STANDARD }, quantity: null },
        { price: { id: PREMIUM }, quantity: -3 },
        { price: { id: PREMIUM }, quantity: 1.5 },
      ]),
    ).toEqual({ standard: 0, premium: 0 });
  });

  it('represents a mixed subscription by its Standard line whatever order Stripe returns', async () => {
    const { primarySeatLineItem, seatLineItemOfType } = await import('../team-seat-items');
    const standard = { id: 'si_standard', price: { id: STANDARD }, quantity: 4 };
    const premium = { id: 'si_premium', price: { id: PREMIUM }, quantity: 1 };

    expect(primarySeatLineItem([premium, standard])).toBe(standard);
    expect(primarySeatLineItem([standard, premium])).toBe(standard);
    expect(primarySeatLineItem([premium])).toBe(premium);
    expect(primarySeatLineItem([])).toBeNull();
    expect(seatLineItemOfType([premium, standard], 'premium')).toBe(premium);
    expect(seatLineItemOfType([standard], 'premium')).toBeNull();
  });
});
