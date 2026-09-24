import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  isSeatBearingBillingPlan,
  resolveEffectiveSubscription,
  resolveEntitlementBundle,
} from '../effective-subscription-service';
import {
  resolveOrganizationEntitlementPlan,
  resolveUserPersonalPlanTier,
} from '../org-entitlements';

const PERIOD_START = '2026-09-01T00:00:00.000Z';
const PERIOD_END = '2026-10-01T00:00:00.000Z';
const ORG = '11111111-1111-4111-8111-111111111111';

const scopedDb = { query: vi.fn() } as unknown as DatabaseAdapter;

function ownRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-own',
    user_id: 'member-1',
    plan_tier: 'pro',
    status: 'active',
    current_period_start: new Date(PERIOD_START),
    current_period_end: new Date(PERIOD_END),
    cancel_at_period_end: false,
    stripe_subscription_id: 'sub_stripe_own',
    stripe_price_id: 'price_pro',
    ...overrides,
  };
}

function seatCandidate(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: 'org-1',
    owner_user_id: 'owner-1',
    billing_plan_tier: 'team',
    licensed_seats: 5,
    seat_rank: 2,
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

/**
 * Who is billed and who is blocked, pinned across the three entitlement
 * services before they were consolidated. A behaviour change here is a change
 * to money or to access, never a refactor.
 */
describe('entitlement resolution characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrCreateAccount.mockResolvedValue('account-1');
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: false });
    mocks.privilegedQuery.mockResolvedValue([]);
  });

  it('an own subscription wins and no seat lookup happens', async () => {
    mocks.getSubscription.mockResolvedValue(ownRow());

    const bundle = await resolveEntitlementBundle(scopedDb, 'member-1');

    expect(bundle).toMatchObject({
      userId: 'member-1',
      plan: 'pro',
      status: 'active',
      entitled: true,
      source: 'subscription',
      seatSource: null,
      denialReason: null,
    });
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
    expect(await resolveEffectiveSubscription(scopedDb, 'member-1')).toMatchObject({
      id: 'sub-own',
      plan_tier: 'pro',
    });
  });

  it('no own row and no seat resolves free, unentitled, entitlement_missing', async () => {
    mocks.getSubscription.mockResolvedValue(null);

    const bundle = await resolveEntitlementBundle(scopedDb, 'member-1');
    expect(mocks.privilegedQuery).toHaveBeenCalledWith(
      expect.stringContaining("membership.status = 'active'"),
      ['member-1'],
    );

    expect(bundle).toMatchObject({
      plan: 'free',
      status: null,
      entitled: false,
      source: 'none',
      subscription: null,
      denialReason: 'entitlement_missing',
    });
  });

  it('a seat within licensed_seats entitles the member to the organization plan', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate()]);

    const bundle = await resolveEntitlementBundle(scopedDb, 'member-1');

    expect(bundle).toMatchObject({
      plan: 'team',
      entitled: true,
      source: 'seat',
      seatSource: { organizationId: 'org-1', ownerUserId: 'owner-1' },
      denialReason: null,
    });
    expect(bundle.subscription).toMatchObject({ user_id: 'member-1', plan_tier: 'team' });
    expect(mocks.getOrCreateAccount).toHaveBeenCalledTimes(1);
  });

  it('a seat beyond licensed_seats does not entitle', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate({ seat_rank: 9, licensed_seats: 5 })]);

    const bundle = await resolveEntitlementBundle(scopedDb, 'member-1');

    expect(bundle).toMatchObject({ plan: 'free', source: 'none', entitled: false });
    expect(mocks.getOrCreateAccount).not.toHaveBeenCalled();
  });

  it('a seat on a plan that does not bear seats does not entitle', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate({ billing_plan_tier: 'pro' })]);

    expect(isSeatBearingBillingPlan('pro')).toBe(false);
    expect(isSeatBearingBillingPlan('team')).toBe(true);
    await expect(resolveEntitlementBundle(scopedDb, 'member-1')).resolves.toMatchObject({
      plan: 'free',
      source: 'none',
    });
  });

  it('seats a contracted organization through the same resolver as a self-serve one', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([
      seatCandidate({ organization_id: 'org-self-serve', billing_plan_tier: 'team' }),
    ]);
    const selfServe = await resolveEntitlementBundle(scopedDb, 'member-1');

    mocks.privilegedQuery.mockResolvedValue([
      seatCandidate({
        organization_id: 'org-contracted',
        billing_plan_tier: 'enterprise',
        stripe_subscription_id: null,
      }),
    ]);
    const contracted = await resolveEntitlementBundle(scopedDb, 'member-1');

    expect(selfServe).toMatchObject({ plan: 'team', source: 'seat', entitled: true });
    expect(contracted).toMatchObject({
      plan: 'enterprise',
      source: 'seat',
      entitled: true,
      seatSource: { organizationId: 'org-contracted' },
    });
    expect(mocks.readOrganizationCollectionState).toHaveBeenCalledTimes(1);
    expect(mocks.readOrganizationCollectionState).toHaveBeenCalledWith(
      expect.anything(),
      'org-contracted',
    );
  });

  it('holds a contracted seat on its collection state, which a self-serve seat never reads', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.readOrganizationCollectionState.mockResolvedValue({ readOnly: true });
    mocks.privilegedQuery.mockResolvedValue([
      seatCandidate({ billing_plan_tier: 'enterprise', stripe_subscription_id: null }),
    ]);

    await expect(resolveEntitlementBundle(scopedDb, 'member-1')).resolves.toMatchObject({
      plan: 'free',
      source: 'none',
      entitled: false,
    });
  });

  it('a failed seat lookup falls back to free rather than throwing', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockRejectedValue(new Error('rls'));

    await expect(resolveEntitlementBundle(scopedDb, 'member-1')).resolves.toMatchObject({
      plan: 'free',
      source: 'none',
      entitled: false,
    });
  });

  it('an unreadable own subscription fails the resolution rather than guessing a plan', async () => {
    mocks.getSubscription.mockRejectedValue(new Error('subscriptions unavailable'));
    mocks.privilegedQuery.mockResolvedValue([seatCandidate()]);

    await expect(resolveEntitlementBundle(scopedDb, 'member-1')).rejects.toThrow(
      'subscriptions unavailable',
    );
    await expect(resolveEffectiveSubscription(scopedDb, 'member-1')).rejects.toThrow(
      'subscriptions unavailable',
    );
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
    expect(mocks.getOrCreateAccount).not.toHaveBeenCalled();
  });

  it('includeSeats false stops at the user own row', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate()]);

    const bundle = await resolveEntitlementBundle(scopedDb, 'member-1', { includeSeats: false });

    expect(bundle).toMatchObject({ plan: 'free', source: 'none' });
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  });

  it('an unpaid own subscription is billed on its plan but blocked as payment_required', async () => {
    mocks.getSubscription.mockResolvedValue(ownRow({ status: 'past_due' }));

    const bundle = await resolveEntitlementBundle(scopedDb, 'member-1');

    expect(bundle.entitled).toBe(false);
    expect(bundle.denialReason).toBe('payment_required');
    expect(bundle.source).toBe('subscription');
  });

  it('resolveUserPersonalPlanTier ignores seats so a seat cannot entitle its own transfer', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.privilegedQuery.mockResolvedValue([seatCandidate()]);

    await expect(resolveUserPersonalPlanTier(scopedDb, 'member-1')).resolves.toBe('free');
    expect(mocks.privilegedQuery).not.toHaveBeenCalled();
  });

  it('organization entitlement resolves from the owner row on the service pool', async () => {
    mocks.privilegedQuery.mockResolvedValue([
      { user_id: 'owner-1', plan_tier: 'team', status: 'active' },
    ]);
    mocks.getSubscription.mockResolvedValue(ownRow({ user_id: 'owner-1', plan_tier: 'team' }));

    await expect(resolveOrganizationEntitlementPlan(ORG)).resolves.toBe('team');
    expect(mocks.privilegedQuery.mock.calls[0]?.[1]).toEqual([ORG]);
  });

  it('an organization whose owner row joins to nothing is free', async () => {
    mocks.privilegedQuery.mockResolvedValue([{ user_id: null, plan_tier: null, status: null }]);

    await expect(resolveOrganizationEntitlementPlan(ORG)).resolves.toBe('free');
    expect(mocks.getSubscription).not.toHaveBeenCalled();
  });
});
