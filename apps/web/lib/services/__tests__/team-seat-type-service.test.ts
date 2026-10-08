import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  permissionQuery: vi.fn(),
  persistSeats: vi.fn(async () => 'persisted'),
  priceSelection: vi.fn(),
  resolveOwnerBundle: vi.fn(),
  carryCredits: vi.fn(async () => 'account-1'),
  events: [] as string[],
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => ({ query: mocks.permissionQuery }),
}));
vi.mock('@/app/api/stripe-webhook/lib/seats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/stripe-webhook/lib/seats')>()),
  persistPurchasedSeatsOnOrganization: mocks.persistSeats,
}));
vi.mock('@/lib/server/localized-pricing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/localized-pricing-service')>()),
  getPriceSelectionForCurrency: mocks.priceSelection,
}));
vi.mock('@/lib/services/subscription-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/subscription-service')>()),
  SubscriptionService: {
    carryCreditsForUpgradePeriod: mocks.carryCredits,
  },
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/entitlement-resolution')>()),
  resolveEntitlementBundle: mocks.resolveOwnerBundle,
}));
vi.mock('@/app/api/settings/team/membership-role-ceiling', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/settings/team/membership-role-ceiling')>()),
  assertMembershipRoleWithinActor: vi.fn(async () => undefined),
}));

const STANDARD_PRICE = 'price_team_standard';
const PREMIUM_PRICE = 'price_team_premium';
const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PERIOD_END_SECONDS = 1_792_592_000;
const PERIOD_END_ISO = new Date(PERIOD_END_SECONDS * 1000).toISOString();

type Service = typeof import('../team-seat-type-service');

async function loadService(): Promise<Service> {
  vi.resetModules();
  return import('../team-seat-type-service');
}

interface Line {
  id: string;
  price: { id: string; recurring: { interval: string; interval_count: number } };
  quantity: number;
}

function line(id: string, price: string, quantity: number): Line {
  return {
    id,
    price: { id: price, recurring: { interval: 'month', interval_count: 1 } },
    quantity,
  };
}

function teamSubscription(
  seats: { standard: number; premium: number | null },
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'sub_team',
    status: 'active',
    currency: 'usd',
    cancel_at_period_end: false,
    cancel_at: null,
    pending_update: null,
    latest_invoice: null,
    current_period_start: PERIOD_END_SECONDS - 2_592_000,
    current_period_end: PERIOD_END_SECONDS,
    items: {
      data: [
        line('si_standard', STANDARD_PRICE, seats.standard),
        ...(seats.premium === null ? [] : [line('si_premium', PREMIUM_PRICE, seats.premium)]),
      ],
    },
    ...overrides,
  };
}

function fakeStripe(current: ReturnType<typeof teamSubscription>) {
  const retrieve = vi.fn(async () => current);
  const update = vi.fn(
    async (
      _id: string,
      params: { items: Array<{ id?: string; price?: string; quantity: number }> },
    ) => {
      mocks.events.push('stripe.update');
      const lines = current.items.data.map((existing) => ({ ...existing }));
      for (const item of params.items) {
        const existing = lines.find((candidate) => candidate.id === item.id);
        if (existing) existing.quantity = item.quantity;
        else lines.push(line(`si_new_${item.price}`, item.price as string, item.quantity));
      }
      return { ...current, items: { data: lines } };
    },
  );
  const stripe = { subscriptions: { retrieve, update } } as unknown as Pick<
    Stripe,
    'subscriptions'
  >;
  return { stripe, retrieve, update };
}

interface World {
  requesterRole: 'owner' | 'admin' | 'member' | null;
  target: { seat_type: string; premium_paid_through_active: boolean } | null;
  assignedPremium: number;
  organization?: Record<string, unknown> | null;
  memberWriteError?: unknown;
}

function fakeDatabases(world: World) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const tx = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('premium_paid_through_active')) {
        return world.target ? [{ user_id: 'target-1', ...world.target }] : [];
      }
      if (sql.includes('as assigned')) return [{ assigned: String(world.assignedPremium) }];
      if (sql.includes('from public.organization_members')) {
        return world.requesterRole
          ? [{ organization_id: ORGANIZATION, user_id: 'admin-1', role: world.requesterRole }]
          : [];
      }
      return [];
    }),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (world.memberWriteError) throw world.memberWriteError;
      mocks.events.push('member.write');
      writes.push({ sql, params });
      return 1;
    }),
  };
  const db = {
    transaction: vi.fn(async (callback: (inner: typeof tx) => unknown) => {
      const result = await callback(tx);
      mocks.events.push('commit');
      return result;
    }),
  } as unknown as DatabaseAdapter;
  const privileged = {
    query: vi.fn(async () =>
      world.organization === null
        ? []
        : [
            {
              owner_user_id: 'owner-1',
              billing_plan_tier: 'team',
              stripe_subscription_id: 'sub_team',
              stripe_customer_id: 'cus_team',
              ...world.organization,
            },
          ],
    ),
  } as unknown as DatabaseAdapter;
  return { db, privileged, tx, writes };
}

function grantPermissions(role: World['requesterRole']) {
  mocks.permissionQuery.mockResolvedValue([
    {
      role,
      permissions: role === 'owner' || role === 'admin' ? ['members.manage', 'billing.read'] : [],
    },
  ]);
}

const ADMIN = { kind: 'member', userId: 'admin-1' } as const;

function request(seatType: 'standard' | 'premium', extra: Record<string, unknown> = {}) {
  return {
    organizationId: ORGANIZATION,
    administrator: ADMIN,
    targetUserId: 'target-1',
    seatType,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.length = 0;
  vi.stubEnv('STRIPE_PRICE_TEAM_MONTHLY_USD', STANDARD_PRICE);
  vi.stubEnv('STRIPE_PRICE_TEAM_PREMIUM_MONTHLY_USD', PREMIUM_PRICE);
  grantPermissions('admin');
  mocks.persistSeats.mockImplementation(async () => {
    mocks.events.push('seats.persist');
    return 'persisted';
  });
  mocks.priceSelection.mockImplementation(
    async (plan: string, _interval: string, currency: string) =>
      plan === 'team_premium'
        ? { priceId: PREMIUM_PRICE, currency: 'usd', amountMinor: 12_500 }
        : { priceId: STANDARD_PRICE, currency, amountMinor: 2_500 },
  );
  mocks.resolveOwnerBundle.mockResolvedValue({
    subscription: {
      id: 'sub-row-owner',
      current_period_start: new Date('2026-10-01T00:00:00.000Z'),
      current_period_end: new Date('2026-11-01T00:00:00.000Z'),
      plan_catalog_version: null,
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('who may change a seat type', () => {
  it('refuses a member without member management, before billing is touched', async () => {
    grantPermissions('member');
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'member',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
    });
    const { stripe, retrieve, update } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }));

    await expect(
      changeMemberSeatType(world.db, { privileged: world.privileged, stripe }, request('premium')),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(retrieve).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(world.writes).toEqual([]);
    expect(mocks.persistSeats).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not a member of the workspace', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: null,
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }));

    await expect(
      changeMemberSeatType(world.db, { privileged: world.privileged, stripe }, request('premium')),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a workspace API key, because a seat type changes what the workspace pays', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
    });
    const { stripe, retrieve } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }));

    await expect(
      changeMemberSeatType(
        world.db,
        { privileged: world.privileged, stripe },
        {
          ...request('premium'),
          administrator: {
            kind: 'service_principal',
            actorId: 'key-1',
            scopes: new Set(['members.manage'] as const),
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe('moving a member to a Premium seat', () => {
  it('converts one Standard seat, charges the rest of the period now and keeps the renewal date', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 3, premium: null }));

    const change = await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('premium', { idempotencyKey: 'attempt-1' }),
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]).toEqual([
      'sub_team',
      {
        items: [
          { id: 'si_standard', quantity: 2 },
          { price: PREMIUM_PRICE, quantity: 1 },
        ],
        proration_behavior: 'always_invoice',
        billing_cycle_anchor: 'unchanged',
        payment_behavior: 'pending_if_incomplete',
        expand: ['latest_invoice'],
      },
      { idempotencyKey: 'seat-type:sub_team:attempt-1' },
    ]);
    expect(change).toMatchObject({
      seatType: 'premium',
      previousSeatType: 'standard',
      billing: 'charged_now',
      seats: { standard: 2, premium: 1 },
    });
  });

  it('stores the paid Premium count before the membership becomes Premium', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'owner',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 1,
    });
    const { stripe } = fakeStripe(teamSubscription({ standard: 4, premium: 1 }));
    grantPermissions('owner');

    await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('premium'),
    );

    expect(mocks.events).toEqual(['stripe.update', 'seats.persist', 'member.write', 'commit']);
    expect(mocks.persistSeats).toHaveBeenCalledWith(world.privileged, {
      ownerUserId: 'owner-1',
      seats: 5,
      premiumSeats: 2,
      planTier: 'team',
      stripeSubscriptionId: 'sub_team',
      stripeCustomerId: 'cus_team',
    });
    expect(world.writes[0]?.sql).toContain("seat_type = 'premium'");
    expect(world.writes[0]?.params).toEqual([ORGANIZATION, 'target-1']);
  });

  it('raises the member usage ledger to the Premium allowance for the current period', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
    });
    const { stripe } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }));

    await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('premium'),
    );

    expect(mocks.resolveOwnerBundle).toHaveBeenCalledWith(world.privileged, 'owner-1', {
      includeSeats: false,
    });
    expect(mocks.carryCredits).toHaveBeenCalledWith(
      'target-1',
      'sub-row-owner',
      'team',
      'team_premium',
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-11-01T00:00:00.000Z'),
      world.privileged,
      { previous: null, next: null },
    );
  });

  it('uses a Premium seat the team already pays for without charging again', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 1,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 3, premium: 2 }));

    const change = await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('premium'),
    );

    expect(update).not.toHaveBeenCalled();
    expect(change).toMatchObject({ billing: 'uses_paid_seat', seats: { standard: 3, premium: 2 } });
    expect(world.writes).toHaveLength(1);
  });

  it('assigns nothing while the charge for the Premium seat is incomplete', async () => {
    const { changeMemberSeatType, SeatTypePaymentPendingError } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }));
    update.mockResolvedValueOnce({
      ...teamSubscription({ standard: 3, premium: 0 }),
      pending_update: { subscription_items: [] },
      latest_invoice: { hosted_invoice_url: 'https://invoice.stripe.test/in_1' },
    } as never);

    const attempt = changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('premium'),
    );

    await expect(attempt).rejects.toBeInstanceOf(SeatTypePaymentPendingError);
    await expect(attempt).rejects.toMatchObject({
      paymentUrl: 'https://invoice.stripe.test/in_1',
    });
    expect(world.writes).toEqual([]);
    expect(mocks.persistSeats).not.toHaveBeenCalled();
    expect(mocks.carryCredits).not.toHaveBeenCalled();
  });

  it('cannot assign more Premium seats than are paid for when there is no Standard seat to convert', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 2,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 0, premium: 2 }));

    await expect(
      changeMemberSeatType(world.db, { privileged: world.privileged, stripe }, request('premium')),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(update).not.toHaveBeenCalled();
    expect(world.writes).toEqual([]);
  });

  it('answers the database Premium ceiling with a conflict and leaves the member on Standard', async () => {
    const { changeMemberSeatType, PREMIUM_SEAT_CEILING_CONSTRAINT } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 1,
      memberWriteError: Object.assign(new Error('no paid Premium seat left to assign'), {
        code: '23514',
        constraint: PREMIUM_SEAT_CEILING_CONSTRAINT,
      }),
    });
    const { stripe } = fakeStripe(teamSubscription({ standard: 3, premium: 2 }));

    await expect(
      changeMemberSeatType(world.db, { privileged: world.privileged, stripe }, request('premium')),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(world.writes).toEqual([]);
    expect(mocks.carryCredits).not.toHaveBeenCalled();
  });

  it('refuses when Stripe does not hold the seats that were requested', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }));
    update.mockResolvedValueOnce(teamSubscription({ standard: 3, premium: 0 }) as never);

    await expect(
      changeMemberSeatType(world.db, { privileged: world.privileged, stripe }, request('premium')),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(world.writes).toEqual([]);
  });

  it('does not sell a dollar Premium seat onto a subscription billed in rupees', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
    });
    const { stripe, update } = fakeStripe(
      teamSubscription({ standard: 3, premium: null }, { currency: 'inr' }),
    );

    await expect(
      changeMemberSeatType(world.db, { privileged: world.privileged, stripe }, request('premium')),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(update).not.toHaveBeenCalled();
    expect(world.writes).toEqual([]);
  });

  it.each([
    ['is scheduled to end', { cancel_at_period_end: true }],
    ['has a payment problem', { status: 'past_due' }],
    ['has an earlier change awaiting payment', { pending_update: { subscription_items: [] } }],
  ])('changes nothing while the subscription %s', async (_label, state) => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }, state));

    await expect(
      changeMemberSeatType(world.db, { privileged: world.privileged, stripe }, request('premium')),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(update).not.toHaveBeenCalled();
    expect(world.writes).toEqual([]);
  });

  it('has no seat types to change on a workspace without a Team subscription', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: false },
      assignedPremium: 0,
      organization: { billing_plan_tier: 'enterprise' },
    });
    const { stripe, retrieve } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }));

    await expect(
      changeMemberSeatType(world.db, { privileged: world.privileged, stripe }, request('premium')),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe('moving a member back to a Standard seat', () => {
  it('bills the Standard price from the next renewal, with no proration and no charge', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'premium', premium_paid_through_active: false },
      assignedPremium: 2,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 3, premium: 2 }));

    const change = await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('standard'),
    );

    expect(update.mock.calls[0]?.[1]).toEqual({
      items: [
        { id: 'si_standard', quantity: 4 },
        { id: 'si_premium', quantity: 1 },
      ],
      proration_behavior: 'none',
    });
    expect(change).toMatchObject({
      seatType: 'standard',
      previousSeatType: 'premium',
      billing: 'reduced_at_renewal',
      premiumPaidThrough: PERIOD_END_ISO,
      seats: { standard: 4, premium: 1 },
    });
  });

  it('keeps Premium entitlement until the period the team already paid for ends', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'premium', premium_paid_through_active: false },
      assignedPremium: 1,
    });
    const { stripe } = fakeStripe(teamSubscription({ standard: 3, premium: 1 }));

    await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('standard'),
    );

    expect(world.writes[0]?.sql).toContain("seat_type = 'standard'");
    expect(world.writes[0]?.sql).toContain('premium_paid_through = $3');
    expect(world.writes[0]?.params).toEqual([ORGANIZATION, 'target-1', PERIOD_END_ISO]);
  });

  it('lowers the stored Premium count only after the member has left the Premium seat', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'premium', premium_paid_through_active: false },
      assignedPremium: 2,
    });
    const { stripe } = fakeStripe(teamSubscription({ standard: 3, premium: 2 }));

    await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('standard'),
    );

    expect(mocks.events).toEqual(['stripe.update', 'member.write', 'commit', 'seats.persist']);
    expect(mocks.persistSeats).toHaveBeenCalledWith(
      world.privileged,
      expect.objectContaining({ seats: 5, premiumSeats: 1 }),
    );
    expect(mocks.carryCredits).not.toHaveBeenCalled();
  });

  it('grants no paid-through period for a Premium seat Stripe was never billing', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'premium', premium_paid_through_active: false },
      assignedPremium: 1,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }));

    const change = await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('standard'),
    );

    expect(update).not.toHaveBeenCalled();
    expect(change).toMatchObject({ billing: 'none', premiumPaidThrough: null });
    expect(world.writes[0]?.params).toEqual([ORGANIZATION, 'target-1', null]);
  });
});

describe('repeating and reversing a seat change', () => {
  it('restores a seat inside its paid period without a second charge', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'standard', premium_paid_through_active: true },
      assignedPremium: 1,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 4, premium: 1 }));

    const change = await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('premium'),
    );

    expect(update.mock.calls[0]?.[1]).toEqual({
      items: [
        { id: 'si_standard', quantity: 3 },
        { id: 'si_premium', quantity: 2 },
      ],
      proration_behavior: 'none',
    });
    expect(change.billing).toBe('restored_paid_seat');
    expect(mocks.carryCredits).not.toHaveBeenCalled();
  });

  it('changes nothing and charges nothing when the member already holds that seat type', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({
      requesterRole: 'admin',
      target: { seat_type: 'premium', premium_paid_through_active: false },
      assignedPremium: 1,
    });
    const { stripe, update } = fakeStripe(teamSubscription({ standard: 3, premium: 1 }));

    const change = await changeMemberSeatType(
      world.db,
      { privileged: world.privileged, stripe },
      request('premium'),
    );

    expect(change).toMatchObject({ billing: 'none', seatType: 'premium' });
    expect(update).not.toHaveBeenCalled();
    expect(world.writes).toEqual([]);
    expect(mocks.persistSeats).not.toHaveBeenCalled();
  });

  it('reports a member who is not in the workspace', async () => {
    const { changeMemberSeatType } = await loadService();
    const world = fakeDatabases({ requesterRole: 'admin', target: null, assignedPremium: 0 });
    const { stripe, retrieve } = fakeStripe(teamSubscription({ standard: 3, premium: 0 }));

    await expect(
      changeMemberSeatType(world.db, { privileged: world.privileged, stripe }, request('premium')),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(retrieve).not.toHaveBeenCalled();
  });
});
