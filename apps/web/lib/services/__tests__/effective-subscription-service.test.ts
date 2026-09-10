import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  privilegedQuery: vi.fn(),
  getOrCreateAccount: vi.fn(async () => 'account-1'),
  readOrganizationCollectionState: vi.fn(async () => ({ readOnly: false })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.privilegedQuery }),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mocks.getSubscription },
}));

vi.mock('@/lib/services/credit-service', () => ({
  CreditService: { getOrCreateAccount: mocks.getOrCreateAccount },
}));

vi.mock('@/lib/services/enterprise-collection-state', () => ({
  readOrganizationCollectionState: mocks.readOrganizationCollectionState,
}));

import { getPlanUsageBudgetCents } from '@/lib/server/managed-usage-policy';
import {
  isSeatBearingBillingPlan,
  provisionSeatMemberCreditAccounts,
  resolveEffectiveSubscription,
} from '../effective-subscription-service';

const PERIOD_START = '2026-09-01T00:00:00.000Z';
const PERIOD_END = '2026-10-01T00:00:00.000Z';

const scopedDb = { query: vi.fn() } as unknown as DatabaseAdapter;

function seatCandidate(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: 'org-1',
    owner_user_id: 'owner-1',
    billing_plan_tier: 'team',
    licensed_seats: 5,
    seat_rank: 3,
    subscription_id: 'sub-owner-1',
    status: 'active',
    current_period_start: PERIOD_START,
    current_period_end: PERIOD_END,
    cancel_at_period_end: false,
    stripe_subscription_id: 'sub_stripe_owner',
    stripe_price_id: 'price_team',
    apple_original_transaction_id: null,
    google_purchase_token: null,
    ...overrides,
  };
}

describe('resolveEffectiveSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateAccount.mockResolvedValue('account-1');
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: false });
  });

  it('returns the user own subscription row without looking for a seat', async () => {
    const own = {
      id: 'sub-own',
      user_id: 'member-1',
      plan_tier: 'pro',
      status: 'active',
      current_period_start: new Date(PERIOD_START),
      current_period_end: new Date(PERIOD_END),
      stripe_subscription_id: 'sub_stripe_own',
      stripe_price_id: 'price_pro',
    };
    mocks.getSubscription.mockResolvedValue(own);

    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).resolves.toBe(own);
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
    expect(mocks.getOrCreateAccount).not.toHaveBeenCalled();
  });

  it('derives the organization tier for a seat member who has no row of their own', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate()]);

    const resolved = await resolveEffectiveSubscription(scopedDb, 'member-1');

    expect(resolved).toMatchObject({
      id: 'sub-owner-1',
      user_id: 'member-1',
      plan_tier: 'team',
      status: 'active',
      stripe_subscription_id: 'sub_stripe_owner',
      seat_source: { organizationId: 'org-1', ownerUserId: 'owner-1' },
    });
  });

  it('gives the seat member their own ledger at the plan monthly amount', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate()]);

    await resolveEffectiveSubscription(scopedDb, 'member-1');

    expect(mocks.getOrCreateAccount).toHaveBeenCalledWith(
      'member-1',
      'sub-owner-1',
      new Date(PERIOD_START),
      new Date(PERIOD_END),
      getPlanUsageBudgetCents('team', 'monthly'),
      scopedDb,
    );
  });

  it('returns null when the user is a member of nothing', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([]);

    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).resolves.toBeNull();
    expect(mocks.getOrCreateAccount).not.toHaveBeenCalled();
  });

  it('returns null when the membership sits beyond the licensed seats', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate({ licensed_seats: 2, seat_rank: 3 })]);

    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).resolves.toBeNull();
  });

  it('returns null when the owner subscription is not entitled', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate({ status: 'canceled' })]);

    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).resolves.toBeNull();
  });

  it('returns null when the organization plan carries no seats', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate({ billing_plan_tier: 'pro' })]);

    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).resolves.toBeNull();
  });

  it('blocks an enterprise seat once collection reaches read-only', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([
      seatCandidate({ billing_plan_tier: 'enterprise', status: 'past_due' }),
    ]);
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: true });

    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).resolves.toBeNull();

    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: false });
    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).resolves.toMatchObject({
      plan_tier: 'enterprise',
      status: 'past_due',
    });
  });

  it('takes the first qualifying organization when an earlier one does not qualify', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([
      seatCandidate({ organization_id: 'org-early', status: 'canceled' }),
      seatCandidate({ organization_id: 'org-late', subscription_id: 'sub-owner-late' }),
    ]);

    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).resolves.toMatchObject({
      id: 'sub-owner-late',
      seat_source: { organizationId: 'org-late', ownerUserId: 'owner-1' },
    });
  });

  it('falls back to no seat when the seat lookup itself fails', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockRejectedValue(new Error('connection reset'));

    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).resolves.toBeNull();
  });
});

describe('isSeatBearingBillingPlan', () => {
  it('accepts the per-seat and contract-priced plans only', () => {
    expect(isSeatBearingBillingPlan('team')).toBe(true);
    expect(isSeatBearingBillingPlan('enterprise')).toBe(true);
    expect(isSeatBearingBillingPlan('pro')).toBe(false);
    expect(isSeatBearingBillingPlan('free')).toBe(false);
    expect(isSeatBearingBillingPlan(null)).toBe(false);
  });
});

describe('provisionSeatMemberCreditAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateAccount.mockResolvedValue('account-1');
  });

  it('allocates the plan monthly amount to every seated member of the sweep', async () => {
    const db = {
      query: vi.fn(async () => [
        { organization_id: 'org-1', billing_plan_tier: 'team', user_id: 'member-1' },
        { organization_id: 'org-1', billing_plan_tier: 'team', user_id: 'member-2' },
      ]),
    } as unknown as DatabaseAdapter;

    const provisioned = await provisionSeatMemberCreditAccounts(db, {
      ownerUserId: 'owner-1',
      subscriptionId: 'sub-owner-1',
      periodStart: new Date(PERIOD_START),
      periodEnd: new Date(PERIOD_END),
    });

    expect(provisioned).toBe(2);
    expect(mocks.getOrCreateAccount).toHaveBeenNthCalledWith(
      1,
      'member-1',
      'sub-owner-1',
      new Date(PERIOD_START),
      new Date(PERIOD_END),
      getPlanUsageBudgetCents('team', 'monthly'),
      db,
    );
  });

  it('keeps sweeping when one member ledger fails', async () => {
    const db = {
      query: vi.fn(async () => [
        { organization_id: 'org-1', billing_plan_tier: 'team', user_id: 'member-1' },
        { organization_id: 'org-1', billing_plan_tier: 'team', user_id: 'member-2' },
      ]),
    } as unknown as DatabaseAdapter;
    mocks.getOrCreateAccount.mockRejectedValueOnce(new Error('deadlock detected'));

    await expect(
      provisionSeatMemberCreditAccounts(db, {
        ownerUserId: 'owner-1',
        subscriptionId: 'sub-owner-1',
        periodStart: new Date(PERIOD_START),
        periodEnd: new Date(PERIOD_END),
      }),
    ).resolves.toBe(1);
  });
});
