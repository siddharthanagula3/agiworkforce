import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  privilegedQuery: vi.fn(),
  getOrCreateAccount: vi.fn(async () => 'account-1'),
  readOrganizationCollectionState: vi.fn(async () => ({ readOnly: false })),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/observability/denials', async (importOriginal) => ({
  ...(await importOriginal<DenialsModule>()),
  recordCapabilityDenial: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({ query: mocks.privilegedQuery }),
}));
vi.mock('@/lib/services/subscription-service', async (importOriginal) => ({
  ...(await importOriginal<SubscriptionServiceModule>()),
  SubscriptionService: { getSubscription: mocks.getSubscription },
}));
vi.mock('@/lib/services/credit-service', async (importOriginal) => ({
  ...(await importOriginal<CreditServiceModule>()),
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),
  CreditService: { getOrCreateAccount: mocks.getOrCreateAccount },
}));
vi.mock('@/lib/services/enterprise-collection-state', async (importOriginal) => ({
  ...(await importOriginal<EnterpriseCollectionStateModule>()),
  readOrganizationCollectionState: mocks.readOrganizationCollectionState,
}));

import {
  canUseBillingPlanCapability,
  getBillingPlanProductLimits,
  getPlanMaxConcurrentTurns,
  normalizeSubscriptionAccessTier,
} from '@agiworkforce/types';
import {
  getPlanSessionUsageBudgetCents,
  getPlanUsageBudgetCents,
  getPlanWeeklyUsageBudgetCents,
} from '@/lib/server/managed-usage-policy';
import {
  provisionSeatMemberCreditAccounts,
  resolveEntitledPlanTier,
  resolveEntitlementBundle,
} from '../effective-subscription-service';
import {
  SEAT_ASSIGNMENT_COLUMNS_SQL,
  entitledSeatType,
  resolveOwnerSeatPlanTier,
  seatHolderPlanTier,
  type SeatAssignmentColumns,
} from '../team-seat-entitlement';

type LoggerModule = typeof import('@/lib/logger');
type DenialsModule = typeof import('@/lib/observability/denials');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type CreditServiceModule = typeof import('@/lib/services/credit-service');
type EnterpriseCollectionStateModule = typeof import('@/lib/services/enterprise-collection-state');
type SubscriptionServiceModule = typeof import('@/lib/services/subscription-service');

const PERIOD_START = '2026-09-01T00:00:00.000Z';
const PERIOD_END = new Date(Date.now() + 20 * 86_400_000).toISOString();
const IN_PERIOD = new Date(Date.now() + 5 * 86_400_000).toISOString();
const PAST_PERIOD = new Date(Date.now() + 400 * 86_400_000).toISOString();
const ALREADY_OVER = new Date(Date.now() - 86_400_000).toISOString();

const scopedDb = { query: vi.fn(async () => []) } as unknown as DatabaseAdapter;

function seat(overrides: Partial<SeatAssignmentColumns> = {}): SeatAssignmentColumns {
  return {
    seat_type: 'standard',
    premium_paid_through: null,
    licensed_premium_seats: 0,
    premium_seat_rank: 0,
    ...overrides,
  };
}

const PREMIUM_SEAT = seat({
  seat_type: 'premium',
  licensed_premium_seats: 2,
  premium_seat_rank: 1,
});

function seatCandidate(overrides: object = {}) {
  return {
    organization_id: 'org-1',
    owner_user_id: 'owner-1',
    billing_plan_tier: 'team',
    licensed_seats: 5,
    seat_rank: 3,
    ...seat(),
    subscription_id: 'sub-owner-1',
    status: 'active',
    current_period_start: PERIOD_START,
    current_period_end: PERIOD_END,
    cancel_at_period_end: false,
    stripe_subscription_id: 'sub_stripe_owner',
    stripe_price_id: 'price_team',
    apple_original_transaction_id: null,
    google_purchase_token: null,
    plan_catalog_version: null,
    ...overrides,
  };
}

function ownTeamSubscription() {
  return {
    id: 'sub-owner-1',
    user_id: 'owner-1',
    plan_tier: 'team',
    status: 'active',
    current_period_start: new Date(PERIOD_START),
    current_period_end: new Date(PERIOD_END),
    stripe_subscription_id: 'sub_stripe_owner',
    stripe_price_id: 'price_team',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrCreateAccount.mockResolvedValue('account-1');
  mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: false });
});

function seatTypeAt(row: SeatAssignmentColumns) {
  return entitledSeatType(row, PERIOD_END);
}

describe('which seat type a membership is entitled to', () => {
  it('is Premium for a Premium assignment inside the paid Premium count', () => {
    expect(seatTypeAt(PREMIUM_SEAT)).toBe('premium');
    expect(seatTypeAt(seat({ ...PREMIUM_SEAT, premium_seat_rank: 2 }))).toBe('premium');
  });

  it('is Standard for a Premium assignment the team no longer pays for', () => {
    expect(seatTypeAt(seat({ ...PREMIUM_SEAT, premium_seat_rank: 3 }))).toBe('standard');
    expect(seatTypeAt(seat({ ...PREMIUM_SEAT, licensed_premium_seats: 0 }))).toBe('standard');
    expect(seatTypeAt(seat({ ...PREMIUM_SEAT, premium_seat_rank: null }))).toBe('standard');
  });

  it('is Standard for a Standard assignment, however many Premium seats are paid for', () => {
    expect(seatTypeAt(seat({ licensed_premium_seats: 10, premium_seat_rank: 0 }))).toBe('standard');
  });

  it('stays Premium through a period already paid at the Premium price', () => {
    expect(seatTypeAt(seat({ premium_paid_through: IN_PERIOD }))).toBe('premium');
  });

  it('honours a paid-through date only up to the end of the period the owner paid for', () => {
    expect(seatTypeAt(seat({ premium_paid_through: PAST_PERIOD }))).toBe('standard');
    expect(seatTypeAt(seat({ premium_paid_through: ALREADY_OVER }))).toBe('standard');
    expect(entitledSeatType(seat({ premium_paid_through: IN_PERIOD }), null)).toBe('standard');
  });

  it('reads an unknown stored seat type as Standard', () => {
    expect(seatTypeAt(seat({ ...PREMIUM_SEAT, seat_type: 'gold' }))).toBe('standard');
    expect(seatTypeAt(seat({ ...PREMIUM_SEAT, seat_type: null }))).toBe('standard');
  });

  it('applies a seat type only on the plan that sells seat types', () => {
    expect(seatHolderPlanTier('team', PREMIUM_SEAT, PERIOD_END)).toBe('team_premium');
    expect(seatHolderPlanTier('team', seat(), PERIOD_END)).toBe('team');
    expect(seatHolderPlanTier('team', null, PERIOD_END)).toBe('team');
    expect(seatHolderPlanTier('enterprise', PREMIUM_SEAT, PERIOD_END)).toBe('enterprise');
    expect(seatHolderPlanTier('pro', PREMIUM_SEAT, PERIOD_END)).toBe('pro');
  });
});

describe('a member on a Premium seat', () => {
  beforeEach(() => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate(PREMIUM_SEAT)]);
  });

  it('gets the Max 5x usage limits in every window', async () => {
    const plan = await resolveEntitledPlanTier(scopedDb, 'member-1');

    expect(getPlanUsageBudgetCents(plan)).toBe(getPlanUsageBudgetCents('max'));
    expect(getPlanWeeklyUsageBudgetCents(plan)).toBe(getPlanWeeklyUsageBudgetCents('max'));
    expect(getPlanSessionUsageBudgetCents(plan)).toBe(getPlanSessionUsageBudgetCents('max'));
    expect(getPlanUsageBudgetCents(plan)).toBeGreaterThan(getPlanUsageBudgetCents('team'));
  });

  it('gets the Max 5x product limits and model access', async () => {
    const plan = await resolveEntitledPlanTier(scopedDb, 'member-1');

    expect(getBillingPlanProductLimits(plan)).toEqual(getBillingPlanProductLimits('max'));
    expect(getPlanMaxConcurrentTurns(plan)).toBe(getPlanMaxConcurrentTurns('max'));
    expect(normalizeSubscriptionAccessTier(plan)).toBe(normalizeSubscriptionAccessTier('max'));
  });

  it('stays in the team workspace with every Team capability', async () => {
    const bundle = await resolveEntitlementBundle(scopedDb, 'member-1');

    expect(bundle).toMatchObject({
      plan: 'team_premium',
      entitled: true,
      source: 'seat',
      seatSource: { organizationId: 'org-1', ownerUserId: 'owner-1' },
    });
    expect(canUseBillingPlanCapability(bundle.plan, 'team_admin')).toBe(true);
  });

  it('opens its usage ledger at the Premium monthly amount', async () => {
    await resolveEntitlementBundle(scopedDb, 'member-1');

    expect(mocks.getOrCreateAccount).toHaveBeenCalledWith(
      'member-1',
      'sub-owner-1',
      expect.any(Date),
      expect.any(Date),
      getPlanUsageBudgetCents('max', 'monthly'),
      scopedDb,
      null,
    );
  });
});

describe('a member on a Standard seat', () => {
  beforeEach(() => {
    mocks.getSubscription.mockResolvedValue(null);
  });

  it('does not get the Max 5x limits, even in a team that pays for Premium seats', async () => {
    mocks.privilegedQuery.mockResolvedValue([seatCandidate(seat({ licensed_premium_seats: 3 }))]);

    const plan = await resolveEntitledPlanTier(scopedDb, 'member-1');

    expect(plan).toBe('team');
    expect(getPlanUsageBudgetCents(plan)).toBeLessThan(getPlanUsageBudgetCents('max'));
    expect(getBillingPlanProductLimits(plan)).not.toEqual(getBillingPlanProductLimits('max'));
    expect(normalizeSubscriptionAccessTier(plan)).not.toBe(normalizeSubscriptionAccessTier('max'));
  });

  it('falls to the Standard limits when its Premium assignment is beyond the paid count', async () => {
    mocks.privilegedQuery.mockResolvedValue([
      seatCandidate({ ...PREMIUM_SEAT, licensed_premium_seats: 1, premium_seat_rank: 2 }),
    ]);

    await expect(resolveEntitledPlanTier(scopedDb, 'member-1')).resolves.toBe('team');
  });

  it('keeps the Premium limits until the period it was moved in ends', async () => {
    mocks.privilegedQuery.mockResolvedValue([
      seatCandidate(seat({ premium_paid_through: IN_PERIOD })),
    ]);

    await expect(resolveEntitledPlanTier(scopedDb, 'member-1')).resolves.toBe('team_premium');
  });

  it('gets no seat at all, Premium or not, beyond the licensed seat count', async () => {
    mocks.privilegedQuery.mockResolvedValue([
      seatCandidate({ ...PREMIUM_SEAT, licensed_seats: 2, seat_rank: 3 }),
    ]);

    await expect(resolveEntitledPlanTier(scopedDb, 'member-1')).resolves.toBe('free');
  });
});

describe('the owner of the team subscription', () => {
  beforeEach(() => {
    mocks.getSubscription.mockResolvedValue(ownTeamSubscription());
  });

  it('gets the Max 5x limits when the owner holds a Premium seat', async () => {
    mocks.privilegedQuery.mockResolvedValue([PREMIUM_SEAT]);

    const bundle = await resolveEntitlementBundle(scopedDb, 'owner-1');

    expect(bundle).toMatchObject({ plan: 'team_premium', source: 'subscription', entitled: true });
    expect(mocks.privilegedQuery.mock.calls[0]?.[1]).toEqual(['owner-1', 'sub_stripe_owner']);
  });

  it('stays on the Standard limits on a Standard seat', async () => {
    mocks.privilegedQuery.mockResolvedValue([seat({ licensed_premium_seats: 4 })]);

    await expect(resolveEntitledPlanTier(scopedDb, 'owner-1')).resolves.toBe('team');
  });

  it('leaves the organization on Team whatever seat its owner holds', async () => {
    mocks.privilegedQuery.mockResolvedValue([PREMIUM_SEAT]);

    await expect(
      resolveEntitledPlanTier(scopedDb, 'owner-1', { includeSeats: false }),
    ).resolves.toBe('team');
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  });

  it('is entitled at the Standard seat when the seat type cannot be read', async () => {
    mocks.privilegedQuery.mockRejectedValue(new Error('connection terminated'));

    await expect(resolveEntitledPlanTier(scopedDb, 'owner-1')).resolves.toBe('team');
  });

  it('asks nothing about seat types for a subscription that is not Team', async () => {
    mocks.getSubscription.mockResolvedValue({ ...ownTeamSubscription(), plan_tier: 'max' });

    await expect(resolveEntitledPlanTier(scopedDb, 'owner-1')).resolves.toBe('max');
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  });

  it('sizes the owner allowance from the seat the owner holds', async () => {
    const db = { query: vi.fn(async () => [PREMIUM_SEAT]) } as unknown as DatabaseAdapter;

    await expect(resolveOwnerSeatPlanTier(db, 'owner-1', 'team', null, PERIOD_END)).resolves.toBe(
      'team_premium',
    );
    await expect(resolveOwnerSeatPlanTier(db, 'owner-1', 'pro', null, PERIOD_END)).resolves.toBe(
      'pro',
    );
  });
});

describe('the monthly ledger sweep', () => {
  it('opens each seat member ledger at the amount of the seat they hold', async () => {
    const db = {
      query: vi.fn(async () => [
        {
          organization_id: 'org-1',
          billing_plan_tier: 'team',
          user_id: 'standard-member',
          ...seat(),
        },
        {
          organization_id: 'org-1',
          billing_plan_tier: 'team',
          user_id: 'premium-member',
          ...PREMIUM_SEAT,
        },
      ]),
    } as unknown as DatabaseAdapter;

    const provisioned = await provisionSeatMemberCreditAccounts(db, {
      ownerUserId: 'owner-1',
      subscriptionId: 'sub-owner-1',
      periodStart: new Date(PERIOD_START),
      periodEnd: new Date(PERIOD_END),
    });

    expect(provisioned).toBe(2);
    const budgets = new Map(
      mocks.getOrCreateAccount.mock.calls.map((call) => {
        const [userId, , , , budget] = call as unknown as [string, string, Date, Date, number];
        return [userId, budget];
      }),
    );
    expect(budgets.get('standard-member')).toBe(getPlanUsageBudgetCents('team', 'monthly'));
    expect(budgets.get('premium-member')).toBe(getPlanUsageBudgetCents('max', 'monthly'));
  });
});

describe('the seat assignment columns', () => {
  it('reads the paid-through date as stored and leaves the cap to the owner period the caller holds', () => {
    expect(SEAT_ASSIGNMENT_COLUMNS_SQL).toContain(
      'membership.premium_paid_through as premium_paid_through',
    );
    expect(SEAT_ASSIGNMENT_COLUMNS_SQL).not.toMatch(/public\.subscriptions/);
  });

  it('ranks Premium holders among active members only', () => {
    expect(SEAT_ASSIGNMENT_COLUMNS_SQL).toContain("premium_peer.status = 'active'");
  });
});
