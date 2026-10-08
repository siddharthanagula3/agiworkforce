import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

type LoggerModule = typeof import('@/lib/logger');
type LocalizedPricingServiceModule = typeof import('@/lib/server/localized-pricing-service');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/localized-pricing-service', async (importOriginal) => ({
  ...(await importOriginal<LocalizedPricingServiceModule>()),
  getPriceSelectionForCurrency: vi.fn(async () => null),
}));

const STANDARD = 'price_team_standard';
const PREMIUM = 'price_team_premium';
const PRO = 'price_pro_monthly';

type PlanChange = typeof import('../stripe-plan-change');

async function load(): Promise<PlanChange> {
  vi.resetModules();
  return import('../stripe-plan-change');
}

function subscription(
  lines: Array<{ id: string; price: string; quantity: number; unitAmount?: number }>,
): Stripe.Subscription {
  return {
    id: 'sub_team',
    items: {
      data: lines.map((entry) => ({
        id: entry.id,
        quantity: entry.quantity,
        price: { id: entry.price, unit_amount: entry.unitAmount ?? 0 },
      })),
    },
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', PRO);
  vi.stubEnv('STRIPE_PRICE_TEAM_MONTHLY_USD', STANDARD);
  vi.stubEnv('STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD', PREMIUM);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('adding seats to a team that mixes seat types', () => {
  it('counts both lines as the current seats, whichever line Stripe lists first', async () => {
    const { seatChangeBasis } = await load();
    const mixed = subscription([
      { id: 'si_premium', price: PREMIUM, quantity: 2, unitAmount: 12_500 },
      { id: 'si_standard', price: STANDARD, quantity: 4, unitAmount: 2_500 },
    ]);

    expect(seatChangeBasis(mixed)).toMatchObject({
      currentSeats: 6,
      premiumSeats: 2,
      premiumRecurringCents: 25_000,
    });
    expect(seatChangeBasis(mixed)?.item.id).toBe('si_standard');
  });

  it('adds the new seats to the Standard line and leaves the Premium line alone', async () => {
    const { planChangeItems, seatChangeBasis } = await load();
    const basis = seatChangeBasis(
      subscription([
        { id: 'si_premium', price: PREMIUM, quantity: 2 },
        { id: 'si_standard', price: STANDARD, quantity: 4 },
      ]),
    )!;

    expect(planChangeItems(basis, STANDARD, 9)).toEqual([
      { id: 'si_standard', price: STANDARD, quantity: 7 },
    ]);
  });

  it('opens a Standard line for a team that so far holds only Premium seats', async () => {
    const { planChangeItems, seatChangeBasis } = await load();
    const basis = seatChangeBasis(
      subscription([{ id: 'si_premium', price: PREMIUM, quantity: 3 }]),
    )!;

    expect(basis).toMatchObject({ currentSeats: 3, premiumSeats: 3 });
    expect(planChangeItems(basis, STANDARD, 5)).toEqual([{ price: STANDARD, quantity: 2 }]);
  });

  it('confirms a change only when Stripe holds the target price and the full seat count', async () => {
    const { planChangeApplied } = await load();
    const applied = subscription([
      { id: 'si_standard', price: STANDARD, quantity: 7 },
      { id: 'si_premium', price: PREMIUM, quantity: 2 },
    ]);

    expect(planChangeApplied(applied, STANDARD, 9)).toBe(true);
    expect(planChangeApplied(applied, STANDARD, 8)).toBe(false);
    expect(planChangeApplied(applied, PRO, 9)).toBe(false);
  });

  it('leaves a plan with no seat types on its single line', async () => {
    const { planChangeApplied, planChangeItems, seatChangeBasis } = await load();
    const individual = subscription([{ id: 'si_pro', price: PRO, quantity: 1 }]);
    const basis = seatChangeBasis(individual)!;

    expect(basis).toMatchObject({ currentSeats: 1, premiumSeats: 0, premiumRecurringCents: 0 });
    expect(planChangeItems(basis, 'price_max_monthly', 1)).toEqual([
      { id: 'si_pro', price: 'price_max_monthly', quantity: 1 },
    ]);
    expect(
      planChangeApplied(
        subscription([{ id: 'si_pro', price: 'price_max_monthly', quantity: 1 }]),
        'price_max_monthly',
        1,
      ),
    ).toBe(true);
  });

  it('has no basis for a subscription with no items', async () => {
    const { seatChangeBasis } = await load();

    expect(seatChangeBasis(subscription([]))).toBeNull();
  });
});
