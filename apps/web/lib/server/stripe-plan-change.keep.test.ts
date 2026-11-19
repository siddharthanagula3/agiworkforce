import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('server-only', () => ({}));

import { ScheduledChangeReleasedError, keepCurrentPlan } from './stripe-plan-change';
import type { ManagedStripeSubscription } from './stripe-upgrade-subscription';

function managedWith(subscription: Record<string, unknown>): ManagedStripeSubscription {
  return {
    row: {},
    customerId: 'cus_1',
    subscriptionId: 'sub_1',
    subscription: { id: 'sub_1', ...subscription },
  } as unknown as ManagedStripeSubscription;
}

function stripeWith(overrides: { retrieve?: ReturnType<typeof vi.fn> }) {
  const release = vi.fn().mockResolvedValue({});
  const retrieve =
    overrides.retrieve ??
    vi.fn().mockResolvedValue({ id: 'sub_1', cancel_at_period_end: false, canceled_at: null });
  const update = vi.fn().mockResolvedValue({
    id: 'sub_1',
    cancel_at_period_end: false,
    canceled_at: null,
  });
  const stripe = {
    subscriptionSchedules: { release },
    subscriptions: { retrieve, update },
  } as unknown as Stripe;
  return { stripe, release, retrieve, update };
}

describe('keepCurrentPlan', () => {
  it('names the released schedule when the step after the release fails', async () => {
    const { stripe, release } = stripeWith({
      retrieve: vi.fn().mockRejectedValue(new Error('network down')),
    });

    const failure = await keepCurrentPlan(
      stripe,
      managedWith({ schedule: 'sub_sched_1', cancel_at_period_end: false, cancel_at: null }),
      'key-1',
    ).catch((error: unknown) => error);

    expect(release).toHaveBeenCalledTimes(1);
    expect(failure).toBeInstanceOf(ScheduledChangeReleasedError);
    expect((failure as ScheduledChangeReleasedError).cause).toEqual(new Error('network down'));
  });

  it('leaves a failed release as an ordinary refusal', async () => {
    const { stripe, release } = stripeWith({});
    release.mockRejectedValueOnce(new Error('stripe 500'));

    const failure = await keepCurrentPlan(
      stripe,
      managedWith({ schedule: 'sub_sched_1', cancel_at_period_end: false, cancel_at: null }),
      'key-1',
    ).catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(ScheduledChangeReleasedError);
  });

  it('does not wrap a failure when there was no schedule to release', async () => {
    const { stripe, release, update } = stripeWith({});
    update.mockRejectedValueOnce(new Error('stripe 500'));

    const failure = await keepCurrentPlan(
      stripe,
      managedWith({ schedule: null, cancel_at_period_end: true, cancel_at: null }),
      'key-1',
    ).catch((error: unknown) => error);

    expect(release).not.toHaveBeenCalled();
    expect(failure).not.toBeInstanceOf(ScheduledChangeReleasedError);
  });
});
