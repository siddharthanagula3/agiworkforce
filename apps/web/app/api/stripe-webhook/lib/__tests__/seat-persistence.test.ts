import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { persistPurchasedSeatsOnOrganization } from '../seats';

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
