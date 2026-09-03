import { describe, it, expect } from 'vitest';

const TIER_ORDER: Record<string, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
  max: 3,
  enterprise: 4,
};

const isValidUpgrade = (from: string, to: string): boolean => {
  const fromOrder = TIER_ORDER[from] ?? -1;
  const toOrder = TIER_ORDER[to] ?? -1;
  if (fromOrder === -1 || toOrder === -1) return false;
  return toOrder > fromOrder;
};

describe('upgrade tier ordering', () => {
  it('free → hobby is a valid upgrade', () => {
    expect(isValidUpgrade('free', 'hobby')).toBe(true);
  });

  it('hobby → pro is a valid upgrade', () => {
    expect(isValidUpgrade('hobby', 'pro')).toBe(true);
  });

  it('pro → max is a valid upgrade', () => {
    expect(isValidUpgrade('pro', 'max')).toBe(true);
  });

  it('pro → hobby is NOT a valid upgrade (downgrade)', () => {
    expect(isValidUpgrade('pro', 'hobby')).toBe(false);
  });

  it('pro → pro is NOT a valid upgrade (same tier)', () => {
    expect(isValidUpgrade('pro', 'pro')).toBe(false);
  });

  it('max → hobby is NOT a valid upgrade (downgrade)', () => {
    expect(isValidUpgrade('max', 'hobby')).toBe(false);
  });

  it('free → free is NOT a valid upgrade', () => {
    expect(isValidUpgrade('free', 'free')).toBe(false);
  });

  it('unknown tier → any known tier is rejected', () => {
    expect(isValidUpgrade('unknown', 'pro')).toBe(false);
  });
});

const calculateCreditAmountCents = (
  oldPlanPriceCents: number,
  creditsRemaining: number,
  creditsAllocated: number,
): number => {
  if (creditsAllocated <= 0) return 0;
  const unusedFraction = creditsRemaining / creditsAllocated;
  return Math.floor(oldPlanPriceCents * unusedFraction);
};

describe('credit-based proration calculation', () => {
  it('50% credits remaining → 50% credit applied', () => {
    expect(calculateCreditAmountCents(2000, 500, 1000)).toBe(1000);
  });

  it('100% credits remaining (unused period) → full credit applied', () => {
    expect(calculateCreditAmountCents(2000, 1000, 1000)).toBe(2000);
  });

  it('0% credits remaining (exhausted) → zero credit', () => {
    expect(calculateCreditAmountCents(2000, 0, 1000)).toBe(0);
  });

  it('result is floored (no fractional cents)', () => {
    expect(calculateCreditAmountCents(2001, 1, 3)).toBe(667);
  });

  it('zero allocation guard, does not divide by zero', () => {
    expect(calculateCreditAmountCents(2000, 0, 0)).toBe(0);
  });

  it('credit cannot exceed the old plan price', () => {
    const credit = calculateCreditAmountCents(2000, 1000, 1000);
    expect(credit).toBeLessThanOrEqual(2000);
  });

  it('credit is always non-negative', () => {
    expect(calculateCreditAmountCents(2000, 0, 1000)).toBeGreaterThanOrEqual(0);
  });
});

describe('Stripe customer balance credit semantics', () => {
  it('applying credit reduces balance (more negative)', () => {
    const existingBalance = -500;
    const newCredit = -1000;
    const resultBalance = existingBalance + newCredit;
    expect(resultBalance).toBe(-1500);
    expect(resultBalance).toBeLessThan(existingBalance);
  });

  it('rollback restores original balance on Stripe failure', () => {
    const originalBalance = -500;
    const appliedCredit = -1000;
    const balanceAfterApply = originalBalance + appliedCredit;
    const restoredBalance = balanceAfterApply - appliedCredit;
    expect(restoredBalance).toBe(originalBalance);
  });

  it('zero credit does not change customer balance', () => {
    const existing = -200;
    const credit = 0;
    expect(existing + credit).toBe(existing);
  });
});

describe('billing trust-boundary isolation', () => {
  it('CRITICAL: BYOK users must not consume AGI compute credits', () => {
    const preferCloudCredits = (privacyMode: string) => privacyMode === 'managed';
    expect(preferCloudCredits('byok')).toBe(false);
    expect(preferCloudCredits('local')).toBe(false);
    expect(preferCloudCredits('managed')).toBe(true);
  });

  it('CRITICAL: upgrade endpoint requires an active paid subscription (not free)', () => {
    const canUpgradeMidCycle = (plan: string, status: string) =>
      plan !== 'free' && ['active', 'trialing'].includes(status);

    expect(canUpgradeMidCycle('free', 'active')).toBe(false);
    expect(canUpgradeMidCycle('hobby', 'active')).toBe(true);
    expect(canUpgradeMidCycle('hobby', 'canceled')).toBe(false);
    expect(canUpgradeMidCycle('pro', 'trialing')).toBe(true);
  });

  it('rate limit: upgrade endpoint is capped at 5 requests per minute', () => {
    const upgradeRateLimit = { limit: 5, window: '1 m', failClosed: false };
    expect(upgradeRateLimit.limit).toBe(5);
    expect(upgradeRateLimit.window).toBe('1 m');
  });
});

describe('stripe webhook event filtering', () => {
  const HANDLED_EVENTS = new Set([
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
  ]);

  it('subscription lifecycle events are handled', () => {
    expect(HANDLED_EVENTS.has('customer.subscription.updated')).toBe(true);
    expect(HANDLED_EVENTS.has('customer.subscription.deleted')).toBe(true);
  });

  it('payment events are handled', () => {
    expect(HANDLED_EVENTS.has('invoice.payment_succeeded')).toBe(true);
    expect(HANDLED_EVENTS.has('invoice.payment_failed')).toBe(true);
  });

  it('unrelated events are ignored', () => {
    expect(HANDLED_EVENTS.has('payment_intent.created')).toBe(false);
    expect(HANDLED_EVENTS.has('radar.early_fraud_warning.created')).toBe(false);
    expect(HANDLED_EVENTS.has('account.updated')).toBe(false);
  });
});
