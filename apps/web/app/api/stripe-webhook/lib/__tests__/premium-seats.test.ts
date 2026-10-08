import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: loggerMocks,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

type LoggerModule = typeof import('@/lib/logger');
type SecurityAuditModule = typeof import('@/lib/security-audit');

const STANDARD_PRICE = 'price_team_standard_monthly';
const PREMIUM_PRICE = 'price_team_premium_monthly';
const PREMIUM_YEARLY_PRICE = 'price_team_premium_yearly';

type SeatsModule = typeof import('../seats');

async function loadSeats(): Promise<SeatsModule> {
  vi.resetModules();
  return import('../seats');
}

function line(price: string, quantity: number) {
  return { price: { id: price }, quantity };
}

function recordingDb(rows: {
  organization?: unknown[];
  existing?: unknown[];
  demoted?: unknown[];
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('update public.organization_members')) return rows.demoted ?? [];
    if (sql.includes('set licensed_premium_seats')) return [];
    if (sql.includes('update public.organizations')) return rows.organization ?? [];
    return rows.existing ?? [];
  });
  return { db: { query } as unknown as DatabaseAdapter, calls };
}

const TEAM_INPUT = {
  ownerUserId: 'owner_1',
  seats: 6,
  premiumSeats: 2,
  planTier: 'team',
  stripeSubscriptionId: 'sub_team',
  stripeCustomerId: 'cus_team',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_PRICE_TEAM_MONTHLY_USD', STANDARD_PRICE);
  vi.stubEnv('STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD', PREMIUM_PRICE);
  vi.stubEnv('STRIPE_PRICE_TEAM_PREMIUM_YEARLY_USD', PREMIUM_YEARLY_PRICE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('seat counts on a subscription that bills both seat types', () => {
  it('adds the Standard and Premium lines into one seat count, in either order', async () => {
    const { resolveSubscriptionSeats, resolveSubscriptionPremiumSeats } = await loadSeats();
    const standardFirst = { items: { data: [line(STANDARD_PRICE, 4), line(PREMIUM_PRICE, 2)] } };
    const premiumFirst = { items: { data: [line(PREMIUM_PRICE, 2), line(STANDARD_PRICE, 4)] } };

    for (const subscription of [standardFirst, premiumFirst]) {
      expect(resolveSubscriptionSeats(subscription)).toBe(6);
      expect(resolveSubscriptionPremiumSeats(subscription)).toBe(2);
    }
  });

  it('counts a team that buys only Premium seats', async () => {
    const { buildPurchasedSeatRecord } = await loadSeats();

    expect(
      buildPurchasedSeatRecord('team', { items: { data: [line(PREMIUM_YEARLY_PRICE, 3)] } }),
    ).toEqual({ planTier: 'team', seats: 3, premiumSeats: 3, perSeat: true });
  });

  it('reports no Premium seats on a team that buys only Standard seats', async () => {
    const { buildPurchasedSeatRecord } = await loadSeats();

    expect(
      buildPurchasedSeatRecord('team', { items: { data: [line(STANDARD_PRICE, 5)] } }),
    ).toEqual({ planTier: 'team', seats: 5, premiumSeats: 0, perSeat: true });
  });

  it('keeps a Standard line emptied to zero out of the seat floor', async () => {
    const { resolveSubscriptionSeats, resolveSubscriptionPremiumSeats } = await loadSeats();
    const allPremium = { items: { data: [line(STANDARD_PRICE, 0), line(PREMIUM_PRICE, 2)] } };

    expect(resolveSubscriptionSeats(allPremium)).toBe(2);
    expect(resolveSubscriptionPremiumSeats(allPremium)).toBe(2);
  });

  it('never reports Premium seats for a plan that has no seat types', async () => {
    const { buildPurchasedSeatRecord } = await loadSeats();

    expect(
      buildPurchasedSeatRecord('enterprise', { items: { data: [line(PREMIUM_PRICE, 40)] } })
        .premiumSeats,
    ).toBe(0);
    expect(
      buildPurchasedSeatRecord('pro', { items: { data: [line(PREMIUM_PRICE, 4)] } }).premiumSeats,
    ).toBe(0);
  });

  it('reads both lines of a checkout session', async () => {
    const { resolveCheckoutSessionSeats } = await loadSeats();

    expect(
      resolveCheckoutSessionSeats({
        line_items: { data: [line(STANDARD_PRICE, 3), line(PREMIUM_PRICE, 1)] },
      }),
    ).toBe(4);
  });
});

describe('storing the Premium seat count Stripe bills', () => {
  it('stores the paid Premium count beside the total', async () => {
    const { persistPurchasedSeatsOnOrganization } = await loadSeats();
    const { db, calls } = recordingDb({ organization: [{ id: 'org_1', licensed_seats: 6 }] });

    await expect(persistPurchasedSeatsOnOrganization(db, TEAM_INPUT)).resolves.toBe('persisted');

    const premium = calls.find((call) => call.sql.includes('set licensed_premium_seats'));
    expect(premium?.params).toEqual([2, 'org_1']);
  });

  it('writes the same state when Stripe delivers the same event twice', async () => {
    const { persistPurchasedSeatsOnOrganization } = await loadSeats();
    const first = recordingDb({ organization: [{ id: 'org_1', licensed_seats: 6 }] });
    const replay = recordingDb({ organization: [{ id: 'org_1', licensed_seats: 6 }] });

    await persistPurchasedSeatsOnOrganization(first.db, TEAM_INPUT);
    await persistPurchasedSeatsOnOrganization(replay.db, TEAM_INPUT);
    await persistPurchasedSeatsOnOrganization(replay.db, TEAM_INPUT);

    expect(replay.calls.slice(0, first.calls.length)).toEqual(first.calls);
    expect(replay.calls.slice(first.calls.length)).toEqual(first.calls);
    for (const call of first.calls) {
      expect(call.sql).not.toMatch(/licensed_premium_seats\s*=\s*licensed_premium_seats\s*[+-]/);
    }
  });

  it('returns the latest Premium assignments to Standard when fewer Premium seats are paid for', async () => {
    const { persistPurchasedSeatsOnOrganization } = await loadSeats();
    const { db, calls } = recordingDb({
      organization: [{ id: 'org_1', licensed_seats: 6 }],
      demoted: [{ user_id: 'member_3' }],
    });

    await persistPurchasedSeatsOnOrganization(db, { ...TEAM_INPUT, premiumSeats: 1 });

    const demotion = calls.find((call) => call.sql.includes('update public.organization_members'));
    expect(demotion?.params).toEqual(['org_1', 1]);
    expect(demotion?.sql).toContain("set seat_type = 'standard'");
    expect(demotion?.sql).toContain("member.seat_type = 'premium'");
    expect(demotion?.sql).toMatch(/seat_type_changed_at[\s\S]*<=[\s\S]*seat_type_changed_at/);
    expect(demotion?.sql).toMatch(/\)\s*>\s*\$2/);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', premiumSeats: 1, demotedMembers: 1 }),
      expect.any(String),
    );
  });

  it('demotes nobody while every assigned Premium seat is still paid for', async () => {
    const { persistPurchasedSeatsOnOrganization } = await loadSeats();
    const { db } = recordingDb({ organization: [{ id: 'org_1', licensed_seats: 6 }] });

    await persistPurchasedSeatsOnOrganization(db, TEAM_INPUT);

    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it('follows Stripe down on Premium seats even when the total is refused for being below the seats in use', async () => {
    const { persistPurchasedSeatsOnOrganization } = await loadSeats();
    const { db, calls } = recordingDb({
      organization: [],
      existing: [{ id: 'org_1', seats_consumed: 9, stripe_subscription_id: 'sub_team' }],
    });

    await expect(
      persistPurchasedSeatsOnOrganization(db, { ...TEAM_INPUT, seats: 4, premiumSeats: 0 }),
    ).resolves.toBe('below_consumed_seats');

    expect(calls.find((call) => call.sql.includes('set licensed_premium_seats'))?.params).toEqual([
      0,
      'org_1',
    ]);
  });

  it('leaves an organization bound to another subscription untouched', async () => {
    const { persistPurchasedSeatsOnOrganization } = await loadSeats();
    const { db, calls } = recordingDb({
      organization: [],
      existing: [{ id: 'org_1', seats_consumed: 2, stripe_subscription_id: 'sub_other' }],
    });

    await expect(persistPurchasedSeatsOnOrganization(db, TEAM_INPUT)).resolves.toBe(
      'subscription_mismatch',
    );

    expect(calls.some((call) => call.sql.includes('licensed_premium_seats'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('organization_members'))).toBe(false);
  });
});
