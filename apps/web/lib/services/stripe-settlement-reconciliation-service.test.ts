import { beforeEach, describe, expect, it, vi } from 'vitest';

const repairMock = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/app/api/stripe-webhook/lib/db', () => ({
  updateSubscriptionFromStripeSubscription: (...args: unknown[]) => repairMock(...args),
}));

import {
  reconcileStripeSettlement,
  STRIPE_RECONCILIATION_ALERT_RATIO,
  STRIPE_RECONCILIATION_MIN_SAMPLE,
} from '@/lib/services/stripe-settlement-reconciliation-service';

const PERIOD_START = Math.floor(Date.UTC(2026, 6, 1) / 1000);
const PERIOD_END = Math.floor(Date.UTC(2026, 7, 1) / 1000);

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    stripe_subscription_id: 'sub_1',
    status: 'active',
    plan_tier: 'pro',
    current_period_start: new Date(PERIOD_START * 1000).toISOString(),
    current_period_end: new Date(PERIOD_END * 1000).toISOString(),
    cancel_at_period_end: false,
    ...overrides,
  };
}

function stripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { id: 'price_pro' },
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
        },
      ],
    },
    ...overrides,
  };
}

function fakeDb(rows: unknown[]) {
  return { query: vi.fn().mockResolvedValue(rows), execute: vi.fn() };
}

function fakeStripe(byId: Record<string, unknown>) {
  return {
    subscriptions: {
      retrieve: vi.fn(async (id: string) => {
        const found = byId[id];
        if (!found) {
          throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
        }
        return found;
      }),
    },
  };
}

describe('stripe settlement reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repairMock.mockResolvedValue(undefined);
  });

  it('reports no drift when the stored row already matches Stripe', async () => {
    const summary = await reconcileStripeSettlement({
      db: fakeDb([storedRow()]) as never,
      stripe: fakeStripe({ sub_1: stripeSubscription() }) as never,
    });

    expect(summary.examined).toBe(1);
    expect(summary.diverged).toBe(0);
    expect(summary.alert).toBe(false);
    expect(repairMock).not.toHaveBeenCalled();
  });

  it('repairs a stored status that Stripe disagrees with', async () => {
    const summary = await reconcileStripeSettlement({
      db: fakeDb([storedRow({ status: 'active' })]) as never,
      stripe: fakeStripe({ sub_1: stripeSubscription({ status: 'past_due' }) }) as never,
    });

    expect(summary.diverged).toBe(1);
    expect(summary.repaired).toBe(1);
    expect(summary.drifts[0]?.fields).toContain('status');
    expect(repairMock).toHaveBeenCalledOnce();
  });

  it('detects a billing period that drifted from Stripe', async () => {
    const summary = await reconcileStripeSettlement({
      db: fakeDb([
        storedRow({ current_period_end: new Date((PERIOD_END + 86_400) * 1000).toISOString() }),
      ]) as never,
      stripe: fakeStripe({ sub_1: stripeSubscription() }) as never,
    });

    expect(summary.drifts[0]?.fields).toContain('current_period_end');
    expect(summary.repaired).toBe(1);
  });

  it('flags a subscription Stripe no longer knows about without cancelling it locally', async () => {
    const summary = await reconcileStripeSettlement({
      db: fakeDb([storedRow()]) as never,
      stripe: fakeStripe({}) as never,
    });

    expect(summary.missingInStripe).toBe(1);
    expect(summary.diverged).toBe(1);
    expect(summary.repaired).toBe(0);
    expect(repairMock).not.toHaveBeenCalled();
  });

  it('counts a failed repair as unrepaired instead of losing it', async () => {
    repairMock.mockRejectedValue(new Error('stripe price not registered'));

    const summary = await reconcileStripeSettlement({
      db: fakeDb([storedRow({ status: 'active' })]) as never,
      stripe: fakeStripe({ sub_1: stripeSubscription({ status: 'canceled' }) }) as never,
    });

    expect(summary.repaired).toBe(0);
    expect(summary.unrepaired).toBe(1);
    expect(summary.drifts[0]?.repairError).toContain('stripe price not registered');
  });

  it('alerts only once divergence passes the threshold on a large enough sample', async () => {
    const rows = Array.from({ length: STRIPE_RECONCILIATION_MIN_SAMPLE }, (_unused, index) =>
      storedRow({ user_id: `user-${index}`, stripe_subscription_id: `sub_${index}` }),
    );
    const divergentCount = Math.ceil(
      STRIPE_RECONCILIATION_MIN_SAMPLE * STRIPE_RECONCILIATION_ALERT_RATIO + 1,
    );
    const byId: Record<string, unknown> = {};
    rows.forEach((_row, index) => {
      byId[`sub_${index}`] = stripeSubscription({
        id: `sub_${index}`,
        ...(index < divergentCount ? { status: 'past_due' } : {}),
      });
    });

    const summary = await reconcileStripeSettlement({
      db: fakeDb(rows) as never,
      stripe: fakeStripe(byId) as never,
    });

    expect(summary.diverged).toBe(divergentCount);
    expect(summary.divergenceRatio).toBeGreaterThan(STRIPE_RECONCILIATION_ALERT_RATIO);
    expect(summary.alert).toBe(true);
  });

  it('does not alert on a sample too small to be meaningful', async () => {
    const summary = await reconcileStripeSettlement({
      db: fakeDb([storedRow()]) as never,
      stripe: fakeStripe({ sub_1: stripeSubscription({ status: 'past_due' }) }) as never,
    });

    expect(summary.divergenceRatio).toBe(1);
    expect(summary.alert).toBe(false);
  });
});
