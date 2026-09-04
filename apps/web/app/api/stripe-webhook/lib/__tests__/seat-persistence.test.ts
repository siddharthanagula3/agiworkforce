import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

const recordAuditEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type Stripe from 'stripe';
import { persistPurchasedSeatsOnOrganization, resolvePurchasedSeatsForOwner } from '../seats';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString();
}

function makeDb(handlers: {
  update?: (params: unknown[]) => unknown[];
  select?: (params: unknown[]) => unknown[];
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('update public.organizations')) return handlers.update?.(params) ?? [];
    return handlers.select?.(params) ?? [];
  });
  return { db: { query } as unknown as DatabaseAdapter, calls, query };
}

const INPUT = {
  ownerUserId: 'user_123',
  seats: 25,
  planTier: 'team',
  stripeSubscriptionId: 'sub_123',
  stripeCustomerId: 'cus_123',
};

describe('persistPurchasedSeatsOnOrganization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the purchased seat count and the org-side Stripe anchors', async () => {
    const { db, calls } = makeDb({
      update: () => [{ id: 'org_1', licensed_seats: 25 }],
    });

    await expect(persistPurchasedSeatsOnOrganization(db, INPUT)).resolves.toBe('persisted');

    const update = calls[0]!;
    expect(update.sql).toContain('update public.organizations');
    expect(update.sql).toContain('licensed_seats = $1');
    expect(update.params).toEqual([25, 'team', 'sub_123', 'cus_123', 'user_123']);
  });

  it('never writes seats_consumed, which membership triggers own', async () => {
    const { db, calls } = makeDb({ update: () => [{ id: 'org_1', licensed_seats: 25 }] });

    await persistPurchasedSeatsOnOrganization(db, INPUT);

    expect(calls[0]!.sql).not.toMatch(/set[\s\S]*seats_consumed\s*=/);
  });

  it('scopes the write to the buying owner so no other org can be touched', async () => {
    const { db, calls } = makeDb({ update: () => [{ id: 'org_1', licensed_seats: 25 }] });

    await persistPurchasedSeatsOnOrganization(db, INPUT);

    expect(calls[0]!.sql).toContain('owner_user_id = $5');
    expect(calls[0]!.params.at(-1)).toBe('user_123');
  });

  it('guards the seat ceiling in the WHERE clause rather than tripping the CHECK', async () => {
    const { db, calls } = makeDb({ update: () => [{ id: 'org_1', licensed_seats: 25 }] });

    await persistPurchasedSeatsOnOrganization(db, INPUT);

    expect(calls[0]!.sql).toContain('$1 >= seats_consumed');
  });

  it('reports an over-subscribed downgrade instead of silently succeeding', async () => {
    const { db } = makeDb({
      update: () => [],
      select: () => [{ id: 'org_1', seats_consumed: 40, stripe_subscription_id: 'sub_123' }],
    });

    await expect(persistPurchasedSeatsOnOrganization(db, { ...INPUT, seats: 10 })).resolves.toBe(
      'below_consumed_seats',
    );
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ purchasedSeats: 10, seatsConsumed: 40 }),
      expect.stringContaining('below the seats already occupied'),
    );
  });

  it('reports a buyer with no organization yet without failing the webhook', async () => {
    const { db } = makeDb({ update: () => [], select: () => [] });

    await expect(persistPurchasedSeatsOnOrganization(db, INPUT)).resolves.toBe('no_organization');
    expect(loggerMocks.error).not.toHaveBeenCalled();
  });

  it('refuses to rebind an organization already tied to a different subscription', async () => {
    const { db } = makeDb({
      update: () => [],
      select: () => [{ id: 'org_1', seats_consumed: 2, stripe_subscription_id: 'sub_other' }],
    });

    await expect(persistPurchasedSeatsOnOrganization(db, INPUT)).resolves.toBe(
      'subscription_mismatch',
    );
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ boundSubscriptionId: 'sub_other' }),
      expect.stringContaining('different Stripe subscription'),
    );
  });
});

describe('cancel then re-subscribe', () => {
  it('reports subscription_mismatch while the organization still holds a dead binding', () => {
    const boundToDeadSubscription = makeDb({
      update: () => [],
      select: () => [{ id: 'org-1', seats_consumed: 1, stripe_subscription_id: 'sub_cancelled' }],
    });

    return persistPurchasedSeatsOnOrganization(boundToDeadSubscription.db as DatabaseAdapter, {
      ownerUserId: 'owner-1',
      seats: 5,
      planTier: 'team',
      stripeSubscriptionId: 'sub_new',
      stripeCustomerId: 'cus_1',
    }).then((outcome) => {
      expect(outcome).toBe('subscription_mismatch');
      expect(loggerMocks.error).toHaveBeenCalled();
    });
  });

  it('attaches the new seats once the dead binding has been released', async () => {
    const released = makeDb({
      update: (params) => [{ id: 'org-1', licensed_seats: params[0] }],
    });

    const outcome = await persistPurchasedSeatsOnOrganization(released.db as DatabaseAdapter, {
      ownerUserId: 'owner-1',
      seats: 5,
      planTier: 'team',
      stripeSubscriptionId: 'sub_new',
      stripeCustomerId: 'cus_1',
    });

    expect(outcome).toBe('persisted');
    const update = released.calls.find((c) => c.sql.includes('update public.organizations'));
    expect(update?.params[0]).toBe(5);
    expect(update?.params[2]).toBe('sub_new');
    expect(update?.sql).not.toContain('seats_consumed =');
  });
});

function makeEnterpriseDb(options: {
  licensedSeats: number;
  oldestOpenInvoiceDueAt: string | null;
  updateResult?: (params: unknown[]) => unknown[];
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('update public.organizations')) {
      return options.updateResult?.(params) ?? [{ id: 'org_1', licensed_seats: params[0] }];
    }
    if (sql.includes('select id, licensed_seats') && sql.includes('public.organizations')) {
      return [{ id: 'org_1', licensed_seats: options.licensedSeats }];
    }
    if (
      sql.includes('oldest_open_invoice_due_at') &&
      sql.includes('public.organization_billing_contracts')
    ) {
      return [{ oldest_open_invoice_due_at: options.oldestOpenInvoiceDueAt }];
    }
    return [];
  });
  return { db: { query } as unknown as DatabaseAdapter, calls };
}

const ENTERPRISE_INPUT = {
  ownerUserId: 'user_ent',
  seats: 100,
  planTier: 'enterprise',
  stripeSubscriptionId: 'sub_ent',
  stripeCustomerId: 'cus_ent',
};

describe('persistPurchasedSeatsOnOrganization · enterprise seat expansion guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows a seat decrease regardless of collection stage', async () => {
    const { db, calls } = makeEnterpriseDb({
      licensedSeats: 200,
      oldestOpenInvoiceDueAt: daysAgoIso(120),
    });

    const outcome = await persistPurchasedSeatsOnOrganization(db, {
      ...ENTERPRISE_INPUT,
      seats: 50,
    });

    expect(outcome).toBe('persisted');
    expect(calls.some((call) => call.sql.includes('update public.organizations'))).toBe(true);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('allows a seat increase while the collection stage is current', async () => {
    const { db } = makeEnterpriseDb({ licensedSeats: 10, oldestOpenInvoiceDueAt: null });

    const outcome = await persistPurchasedSeatsOnOrganization(db, ENTERPRISE_INPUT);

    expect(outcome).toBe('persisted');
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('allows a seat increase within the early past-due grace window', async () => {
    const { db } = makeEnterpriseDb({ licensedSeats: 10, oldestOpenInvoiceDueAt: daysAgoIso(10) });

    const outcome = await persistPurchasedSeatsOnOrganization(db, ENTERPRISE_INPUT);

    expect(outcome).toBe('persisted');
  });

  it('refuses a seat increase once collection has blocked new commitments', async () => {
    const { db, calls } = makeEnterpriseDb({
      licensedSeats: 10,
      oldestOpenInvoiceDueAt: daysAgoIso(75),
    });

    const outcome = await persistPurchasedSeatsOnOrganization(db, ENTERPRISE_INPUT);

    expect(outcome).toBe('seat_expansion_blocked');
    expect(calls.some((call) => call.sql.includes('update public.organizations'))).toBe(false);
    expect(loggerMocks.warn).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        detail: expect.objectContaining({ reason: 'seat_expansion_blocked' }),
      }),
    );
  });

  it('refuses a seat increase once the workspace is fully read-only', async () => {
    const { db, calls } = makeEnterpriseDb({
      licensedSeats: 10,
      oldestOpenInvoiceDueAt: daysAgoIso(120),
    });

    const outcome = await persistPurchasedSeatsOnOrganization(db, ENTERPRISE_INPUT);

    expect(outcome).toBe('seat_expansion_blocked');
    expect(calls.some((call) => call.sql.includes('update public.organizations'))).toBe(false);
  });

  it('never runs the guard for a non-enterprise plan tier', async () => {
    const { db, calls } = makeEnterpriseDb({
      licensedSeats: 10,
      oldestOpenInvoiceDueAt: daysAgoIso(120),
    });

    const outcome = await persistPurchasedSeatsOnOrganization(db, { ...INPUT, seats: 999 });

    expect(outcome).toBe('persisted');
    expect(calls.some((call) => call.sql.includes('oldest_open_invoice_due_at'))).toBe(false);
  });
});

describe('resolvePurchasedSeatsForOwner · enterprise entitlement', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeOwnerDb(options: {
    status: string;
    oldestOpenInvoiceDueAt: string | null;
    hasOrganization: boolean;
  }) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from public.subscriptions')) {
        return [
          { plan_tier: 'enterprise', status: options.status, stripe_subscription_id: 'sub_ent' },
        ];
      }
      if (sql.includes('select id from public.organizations')) {
        return options.hasOrganization ? [{ id: 'org_1' }] : [];
      }
      if (
        sql.includes('oldest_open_invoice_due_at') &&
        sql.includes('public.organization_billing_contracts')
      ) {
        return [{ oldest_open_invoice_due_at: options.oldestOpenInvoiceDueAt }];
      }
      return [];
    });
    return { query } as unknown as DatabaseAdapter;
  }

  function stripeReturning(quantity: number) {
    return {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ items: { data: [{ quantity }] } }),
      },
    } as unknown as Pick<Stripe, 'subscriptions'>;
  }

  it('resolves seats for an enterprise owner past due but not yet read-only', async () => {
    const db = makeOwnerDb({
      status: 'past_due',
      oldestOpenInvoiceDueAt: daysAgoIso(10),
      hasOrganization: true,
    });

    const result = await resolvePurchasedSeatsForOwner(db, () => stripeReturning(75), 'user_ent');

    expect(result).toEqual({ seats: 75, planTier: 'enterprise' });
  });

  it('withholds seats once the enterprise organization is read-only', async () => {
    const db = makeOwnerDb({
      status: 'past_due',
      oldestOpenInvoiceDueAt: daysAgoIso(120),
      hasOrganization: true,
    });

    const result = await resolvePurchasedSeatsForOwner(db, () => stripeReturning(75), 'user_ent');

    expect(result).toBeNull();
  });

  it('resolves seats for an active enterprise owner with no collection lookup needed', async () => {
    const db = makeOwnerDb({
      status: 'active',
      oldestOpenInvoiceDueAt: null,
      hasOrganization: true,
    });

    const result = await resolvePurchasedSeatsForOwner(db, () => stripeReturning(20), 'user_ent');

    expect(result).toEqual({ seats: 20, planTier: 'enterprise' });
  });

  it('withholds seats for a canceled enterprise subscription', async () => {
    const db = makeOwnerDb({
      status: 'canceled',
      oldestOpenInvoiceDueAt: null,
      hasOrganization: true,
    });

    const result = await resolvePurchasedSeatsForOwner(db, () => stripeReturning(20), 'user_ent');

    expect(result).toBeNull();
  });
});
